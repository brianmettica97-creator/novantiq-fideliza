// Sellos, puntos, hitos, QR, idempotencia, límites, canjes y correcciones.
import { beforeAll, describe, expect, test } from 'vitest';
import { buildCardQrPayload, currentStep, qrSignature } from '../../src/lib/qr';
import { addMember, createDb, joinAsCustomer, key, rpc, rpcError, setupMerchant, sqlAs, type Db } from './harness';

let db: Db;
let M: Awaited<ReturnType<typeof setupMerchant>>;
let staff: string;

const earn = (card: string, extra: Record<string, unknown> = {}, user = staff) =>
  rpc(db, user, 'record_earn', { p_merchant: M.merchantId, p_branch: M.branchId, p_card_ref: card, p_units: 1, p_idempotency_key: key(), ...extra });
const redeem = (card: string, reward = M.rewardId, k = key()) =>
  rpc(db, staff, 'redeem_reward', { p_merchant: M.merchantId, p_branch: M.branchId, p_card_ref: card, p_reward: reward, p_idempotency_key: k });

beforeAll(async () => {
  db = await createDb();
  await db.query(`update public.platform_settings set value = '1000' where key in ('limits.ops_per_minute', 'limits.lookups_per_minute')`);
  M = await setupMerchant(db, 'Café Central', { stamps: 4, daily: 10 });
  staff = await addMember(db, M.owner, M.merchantId, 'staff');
}, 60000);

describe('QR rotativo', () => {
  test('la firma del navegador coincide con la del servidor', async () => {
    const step = currentStep();
    const js = await qrSignature('secreto-de-prueba', 'a'.repeat(32), step);
    const [r] = (await db.query<{ s: string }>(`select public.qr_signature('secreto-de-prueba', $1, $2) s`, ['a'.repeat(32), step])).rows;
    expect(js).toBe(r.s);
  });

  test('un QR válido identifica la tarjeta', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    const look = await rpc(db, staff, 'staff_lookup_card', { p_merchant: M.merchantId, p_branch: M.branchId, p_card_ref: await buildCardQrPayload(c.secret, c.token) });
    expect(look.ok).toBe(true);
    expect(look.method).toBe('qr');
    expect(look.card.id).toBe(c.cardId);
  });

  test('un QR vencido (captura de pantalla vieja) se rechaza', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    const old = await buildCardQrPayload(c.secret, c.token, Date.now() - 15 * 60 * 1000);
    expect((await earn(old)).error).toBe('qr_expired');
  });

  test('un QR con firma falsificada se rechaza y queda auditado', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    const fake = `NF1.${c.token}.${currentStep()}.${'0'.repeat(16)}`;
    expect((await earn(fake)).error).toBe('qr_invalid');
    const audit = await sqlAs(db, M.owner, `select details from public.audit_log where action = 'operation_rejected' and details->>'reason' = 'qr_invalid'`);
    expect(audit.length).toBeGreaterThan(0);
  });

  test('el código manual admite guiones, minúsculas y confusiones O/0', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    const messy = `${c.code.slice(0, 4).toLowerCase()}-${c.code.slice(4)}`.replace(/0/g, 'o');
    const r = await earn(messy);
    expect(r.ok).toBe(true);
  });
});

describe('sellos', () => {
  test('suma, respeta el máximo por operación y guarda la versión del programa', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    const r = await earn(c.code, { p_units: 2 });
    expect(r).toMatchObject({ ok: true, units: 2, balance: 2 });
    expect((await earn(c.code, { p_units: 4 })).error).toBe('invalid_units');
    expect((await earn(c.code, { p_units: 0 })).error).toBe('invalid_units');
    const [tx] = await sqlAs(db, M.owner, `select program_version, performed_by, branch_id from public.card_transactions where id = $1`, [r.transaction_id]);
    expect(tx).toMatchObject({ program_version: 1, performed_by: staff, branch_id: M.branchId });
  });

  test('idempotencia: la misma clave nunca suma dos veces', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    const k = key();
    const a = await earn(c.code, { p_idempotency_key: k });
    const b = await earn(c.code, { p_idempotency_key: k });
    expect(a.ok && b.ok).toBe(true);
    expect(b.duplicate).toBe(true);
    expect(b.transaction_id).toBe(a.transaction_id);
    const [card] = await sqlAs(db, M.owner, `select balance from public.cards where id = $1`, [c.cardId]);
    expect(card.balance).toBe(1);
  });

  test('límite diario por tarjeta', async () => {
    const m2 = await setupMerchant(db, 'Heladería', { stamps: 10, daily: 2 });
    const c = await joinAsCustomer(db, m2.joinCode);
    const op = () => rpc(db, m2.owner, 'record_earn', { p_merchant: m2.merchantId, p_branch: m2.branchId, p_card_ref: c.code, p_units: 1, p_idempotency_key: key() });
    expect((await op()).ok).toBe(true);
    expect((await op()).ok).toBe(true);
    expect((await op()).error).toBe('daily_limit');
  });

  test('tiempo mínimo entre operaciones', async () => {
    const m3 = await setupMerchant(db, 'Lavadero', { stamps: 10 });
    await sqlAs(db, m3.owner, `update public.programs set min_minutes_between = 30 where id = $1`, [m3.programId]);
    const c = await joinAsCustomer(db, m3.joinCode);
    const op = () => rpc(db, m3.owner, 'record_earn', { p_merchant: m3.merchantId, p_branch: m3.branchId, p_card_ref: c.code, p_units: 1, p_idempotency_key: key() });
    expect((await op()).ok).toBe(true);
    expect((await op()).error).toBe('cooldown');
    await db.query(`update public.card_transactions set created_at = now() - interval '31 minutes' where card_id = $1`, [c.cardId]);
    expect((await op()).ok).toBe(true);
  });

  test('una tarjeta bloqueada no suma ni canjea', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    await rpc(db, M.owner, 'set_card_status', { p_card: c.cardId, p_status: 'blocked', p_reason: 'uso indebido' });
    expect((await earn(c.code)).error).toBe('card_blocked');
    expect((await redeem(c.code)).error).toBe('card_blocked');
  });

  test('un programa pausado no suma pero permite canjear lo ya ganado', async () => {
    const m4 = await setupMerchant(db, 'Peluquería', { stamps: 2 });
    const c = await joinAsCustomer(db, m4.joinCode);
    const op = (fn: string, extra: Record<string, unknown>) => rpc(db, m4.owner, fn, { p_merchant: m4.merchantId, p_branch: m4.branchId, p_card_ref: c.code, p_idempotency_key: key(), ...extra });
    expect((await op('record_earn', { p_units: 2 })).ok).toBe(true);
    await rpc(db, m4.owner, 'set_program_status', { p_program: m4.programId, p_status: 'paused' });
    expect((await op('record_earn', { p_units: 1 })).error).toBe('program_inactive');
    expect((await op('redeem_reward', { p_reward: m4.rewardId })).ok).toBe(true);
  });

  test('cambiar las reglas crea una nueva versión sin alterar el historial', async () => {
    const m5 = await setupMerchant(db, 'Gimnasio', { stamps: 8 });
    const c = await joinAsCustomer(db, m5.joinCode);
    const op = () => rpc(db, m5.owner, 'record_earn', { p_merchant: m5.merchantId, p_branch: m5.branchId, p_card_ref: c.code, p_units: 1, p_idempotency_key: key() });
    await op();
    await sqlAs(db, m5.owner, `update public.programs set stamps_required = 10 where id = $1`, [m5.programId]);
    await sqlAs(db, m5.owner, `update public.programs set description = 'solo texto' where id = $1`, [m5.programId]);
    await op();
    const txs = await sqlAs(db, m5.owner, `select program_version from public.card_transactions where card_id = $1 order by created_at`, [c.cardId]);
    expect(txs.map((t: any) => t.program_version)).toEqual([1, 2]);
    const versions = await sqlAs(db, m5.owner, `select version, rules->>'stamps_required' sr from public.program_versions where program_id = $1 order by version`, [m5.programId]);
    expect(versions).toEqual([{ version: 1, sr: '8' }, { version: 2, sr: '10' }]);
  });
});

describe('canjes', () => {
  test('canje atómico: descuenta saldo, registra y no se repite', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    expect((await redeem(c.code)).error).toBe('insufficient_balance');
    await earn(c.code, { p_units: 3 });
    await earn(c.code, { p_units: 1 });
    const k = key();
    const r = await redeem(c.code, M.rewardId, k);
    expect(r).toMatchObject({ ok: true, balance: 0, delta: -4 });
    const again = await redeem(c.code, M.rewardId, k);
    expect(again.duplicate).toBe(true);
    expect((await redeem(c.code)).error).toBe('insufficient_balance');
    const reds = await sqlAs(db, M.owner, `select status from public.redemptions where card_id = $1`, [c.cardId]);
    expect(reds).toEqual([{ status: 'completed' }]);
  });

  test('stock limitado y máximo por tarjeta', async () => {
    const [limited] = await sqlAs(db, M.owner, `insert into public.rewards (merchant_id, program_id, name, cost, stock, max_per_card) values ($1, $2, 'Taza', 1, 1, 1) returning id`, [M.merchantId, M.programId]);
    const c1 = await joinAsCustomer(db, M.joinCode);
    const c2 = await joinAsCustomer(db, M.joinCode);
    await earn(c1.code, { p_units: 3 });
    await earn(c2.code, { p_units: 3 });
    expect((await redeem(c1.code, limited.id)).ok).toBe(true);
    expect((await redeem(c1.code, limited.id)).error).toMatch(/reward_out_of_stock|reward_limit_reached/);
    expect((await redeem(c2.code, limited.id)).error).toBe('reward_out_of_stock');
  });

  test('una recompensa de otro programa no se puede canjear con esta tarjeta', async () => {
    const other = await setupMerchant(db, 'Mascotas');
    const c = await joinAsCustomer(db, M.joinCode);
    await earn(c.code, { p_units: 3 });
    expect((await redeem(c.code, other.rewardId)).error).toBe('reward_not_found');
  });
});

describe('correcciones auditables', () => {
  test('anular un sello genera un movimiento compensatorio, una sola vez', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    const e = await earn(c.code, { p_units: 2 });
    const rev = await rpc(db, M.owner, 'reverse_transaction', { p_transaction: e.transaction_id, p_reason: 'carga duplicada', p_idempotency_key: key() });
    expect(rev).toMatchObject({ ok: true, delta: -2, balance: 0 });
    const again = await rpc(db, M.owner, 'reverse_transaction', { p_transaction: e.transaction_id, p_reason: 'otra vez', p_idempotency_key: key() });
    expect(again.error).toBe('already_reversed');
    const txs = await sqlAs(db, M.owner, `select type, status, delta from public.card_transactions where card_id = $1 order by created_at`, [c.cardId]);
    expect(txs).toEqual([
      { type: 'earn', status: 'reversed', delta: 2 },
      { type: 'reversal', status: 'completed', delta: -2 },
    ]);
  });

  test('no se anula un sello ya consumido por un canje; se anula primero el canje', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    const e = await earn(c.code, { p_units: 3 });
    await earn(c.code, { p_units: 1 });
    const red = await redeem(c.code);
    const bad = await rpc(db, M.owner, 'reverse_transaction', { p_transaction: e.transaction_id, p_reason: 'error', p_idempotency_key: key() });
    expect(bad.error).toBe('insufficient_balance');
    const undo = await rpc(db, M.owner, 'reverse_transaction', { p_transaction: red.transaction_id, p_reason: 'canje por error', p_idempotency_key: key() });
    expect(undo).toMatchObject({ ok: true, balance: 4 });
    const [r] = await sqlAs(db, M.owner, `select status, cancel_reason from public.redemptions where id = $1`, [red.redemption_id]);
    expect(r).toEqual({ status: 'cancelled', cancel_reason: 'canje por error' });
    expect((await rpc(db, M.owner, 'reverse_transaction', { p_transaction: red.transaction_id, p_reason: 'x de nuevo', p_idempotency_key: key() })).error).toBe('already_reversed');
  });

  test('ajuste manual exige motivo y no deja saldo negativo', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    const adj = (d: number, reason = 'compensación') => rpc(db, M.owner, 'adjust_balance', { p_merchant: M.merchantId, p_card: c.cardId, p_delta: d, p_reason: reason, p_idempotency_key: key() });
    expect((await adj(2, '')).error).toBe('reason_required');
    expect((await adj(-1)).error).toBe('insufficient_balance');
    expect((await adj(2)).ok).toBe(true);
    const audit = await sqlAs(db, M.owner, `select 1 from public.audit_log where action = 'balance_adjusted' and entity_id = $1`, [c.cardId]);
    expect(audit).toHaveLength(1);
  });
});

describe('puntos, hitos y bienvenida', () => {
  test('puntos: regla explícita, tope por operación y mínimo', async () => {
    const m = await setupMerchant(db, 'Restaurante');
    const [p] = await sqlAs(db, m.owner, `insert into public.programs (merchant_id, type, name, earn_points, earn_amount, max_points_per_tx, max_amount_per_tx)
      values ($1, 'points', 'Puntos', 1, 1000, 50, 100000) returning id, join_code`, [m.merchantId]);
    await sqlAs(db, m.owner, `insert into public.rewards (merchant_id, program_id, name, cost) values ($1, $2, 'Postre', 10)`, [m.merchantId, p.id]);
    await rpc(db, m.owner, 'set_program_status', { p_program: p.id, p_status: 'active' });
    const c = await joinAsCustomer(db, p.join_code);
    const op = (amount: number | null) => rpc(db, m.owner, 'record_earn', { p_merchant: m.merchantId, p_branch: m.branchId, p_card_ref: c.code, p_amount: amount, p_idempotency_key: key() });
    expect((await op(12500)).units).toBe(12);
    expect((await op(99000)).units).toBe(50);
    expect((await op(500)).error).toBe('amount_too_low');
    expect((await op(null)).error).toBe('invalid_amount');
    expect((await op(200000)).error).toBe('amount_limit');
  });

  test('hitos: la recompensa no consume el contador y se canjea una vez', async () => {
    const m = await setupMerchant(db, 'Estética');
    const [p] = await sqlAs(db, m.owner, `insert into public.programs (merchant_id, type, name) values ($1, 'milestones', 'Hitos') returning id, join_code`, [m.merchantId]);
    const [r5] = await sqlAs(db, m.owner, `insert into public.rewards (merchant_id, program_id, name, cost) values ($1, $2, 'Premio 2', 2) returning id, max_per_card`, [m.merchantId, p.id]);
    expect(r5.max_per_card).toBe(1);
    await rpc(db, m.owner, 'set_program_status', { p_program: p.id, p_status: 'active' });
    const c = await joinAsCustomer(db, p.join_code);
    const op = (fn: string, extra = {}) => rpc(db, m.owner, fn, { p_merchant: m.merchantId, p_branch: m.branchId, p_card_ref: c.code, p_idempotency_key: key(), ...extra });
    await op('record_earn', { p_units: 1 });
    await op('record_earn', { p_units: 1 });
    expect(await op('redeem_reward', { p_reward: r5.id })).toMatchObject({ ok: true, balance: 2, delta: 0 });
    expect((await op('redeem_reward', { p_reward: r5.id })).error).toBe('reward_limit_reached');
  });

  test('beneficio de bienvenida una sola vez por cliente y programa', async () => {
    const m = await setupMerchant(db, 'Almacén', { stamps: 10 });
    await sqlAs(db, m.owner, `update public.programs set welcome_bonus = 2 where id = $1`, [m.programId]);
    const c = await joinAsCustomer(db, m.joinCode);
    const again = await rpc(db, c.customer, 'join_program', { p_join_code: m.joinCode });
    expect(again.existing).toBe(true);
    const [card] = await sqlAs(db, c.customer, `select balance from public.cards where id = $1`, [c.cardId]);
    expect(card.balance).toBe(2);
  });

  test('el plan inicial no permite programas de puntos', async () => {
    const m = await setupMerchant(db, 'Farmacia');
    await db.query(`update public.subscriptions set plan_id = 'inicial' where merchant_id = $1`, [m.merchantId]);
    const err = await sqlAs(db, m.owner, `insert into public.programs (merchant_id, type, name, earn_points, earn_amount) values ($1, 'points', 'P', 1, 100)`, [m.merchantId]).catch((e) => e.message);
    expect(err).toBe('plan_feature');
  });
});

describe('estado de la suscripción', () => {
  test('una prueba vencida bloquea operaciones e inscripciones', async () => {
    const m = await setupMerchant(db, 'Hamburguesería');
    const c = await joinAsCustomer(db, m.joinCode);
    await db.query(`update public.subscriptions set trial_ends_at = now() - interval '1 day' where merchant_id = $1`, [m.merchantId]);
    const r = await rpc(db, m.owner, 'record_earn', { p_merchant: m.merchantId, p_branch: m.branchId, p_card_ref: c.code, p_units: 1, p_idempotency_key: key() });
    expect(r.error).toBe('trial_expired');
    const c2 = await joinAsCustomer(db, m.joinCode).catch((e) => e.message);
    expect(c2).toMatch(/trial_expired/);
    const pub = await rpc(db, null, 'get_public_program', { p_join_code: m.joinCode });
    expect(pub.joinable).toBe(false);
  });
});

describe('páginas públicas', () => {
  test('anon ve el programa publicado pero no los borradores', async () => {
    const pub = await rpc(db, null, 'get_public_program', { p_join_code: M.joinCode });
    expect(pub.program.name).toBe('Café Frecuente');
    expect(pub.merchant).not.toHaveProperty('contact_email');
    const [draft] = await sqlAs(db, M.owner, `insert into public.programs (merchant_id, type, name, stamps_required) values ($1, 'stamps', 'Borrador', 5) returning join_code`, [M.merchantId]);
    expect(await rpc(db, null, 'get_public_program', { p_join_code: draft.join_code })).toBeNull();
  });

  test('no se publica un programa sin recompensas', async () => {
    const [p] = await sqlAs(db, M.owner, `insert into public.programs (merchant_id, type, name, stamps_required) values ($1, 'stamps', 'Vacío', 5) returning id`, [M.merchantId]);
    expect(await rpcError(db, M.owner, 'set_program_status', { p_program: p.id, p_status: 'active' })).toBe('no_rewards');
  });

  test('las operaciones por empleado tienen límite de frecuencia', async () => {
    await db.query(`update public.platform_settings set value = '3' where key = 'limits.ops_per_minute'`);
    const fast = await addMember(db, M.owner, M.merchantId, 'staff');
    const c = await joinAsCustomer(db, M.joinCode);
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await earn(c.code, {}, fast)).error ?? 'ok');
    await db.query(`update public.platform_settings set value = '1000' where key = 'limits.ops_per_minute'`);
    expect(results).toEqual(['ok', 'ok', 'ok', 'rate_limited']);
  });

  test('el formulario de contacto tiene límite de frecuencia', async () => {
    const send = () => rpcError(db, null, 'submit_contact_request', { p_name: 'Juan', p_email: 'juan@x.com', p_business: 'Kiosco', p_phone: '', p_message: 'Quiero info' });
    for (let i = 0; i < 3; i++) expect(await send()).toBe('NO_ERROR');
    expect(await send()).toBe('rate_limited');
  });
});
