// Aislamiento multi-tenant: ningún comercio puede leer ni modificar datos de otro.
import { beforeAll, describe, expect, test } from 'vitest';
import { addMember, createDb, joinAsCustomer, key, rpc, rpcError, setupMerchant, sqlAs, sqlErrorAs, type Db } from './harness';

let db: Db;
let A: Awaited<ReturnType<typeof setupMerchant>>;
let B: Awaited<ReturnType<typeof setupMerchant>>;
let custA: Awaited<ReturnType<typeof joinAsCustomer>>;
let custB: Awaited<ReturnType<typeof joinAsCustomer>>;
let staffB: string;

beforeAll(async () => {
  db = await createDb();
  A = await setupMerchant(db, 'Café Central');
  B = await setupMerchant(db, 'Gor Burger');
  custA = await joinAsCustomer(db, A.joinCode, 'Ana');
  custB = await joinAsCustomer(db, B.joinCode, 'Beto');
  staffB = await addMember(db, B.owner, B.merchantId, 'staff');
  await rpc(db, A.owner, 'record_earn', { p_merchant: A.merchantId, p_branch: A.branchId, p_card_ref: custA.code, p_units: 1, p_idempotency_key: key() });
}, 60000);

describe('lectura cruzada bloqueada por RLS', () => {
  const tables = ['merchants', 'branches', 'programs', 'rewards', 'cards', 'card_transactions', 'subscriptions', 'memberships', 'program_versions'];
  for (const t of tables) {
    test(`el titular de B no ve filas de A en ${t}`, async () => {
      const col = t === 'merchants' ? 'id' : 'merchant_id';
      const rows = await sqlAs(db, B.owner, `select 1 from public.${t} where ${col} = $1`, [A.merchantId]);
      expect(rows).toHaveLength(0);
    });
  }

  test('el titular ve sus propios datos', async () => {
    const rows = await sqlAs(db, A.owner, `select id from public.cards where merchant_id = $1`, [A.merchantId]);
    expect(rows).toHaveLength(1);
  });

  test('anon no puede leer tablas privadas', async () => {
    for (const t of ['merchants', 'cards', 'card_transactions', 'profiles', 'audit_log']) {
      expect(await sqlErrorAs(db, null, `select * from public.${t}`)).toMatch(/permission denied/);
    }
  });

  test('un cliente solo ve sus propias tarjetas y secretos', async () => {
    const cards = await sqlAs(db, custA.customer, `select id from public.cards`);
    expect(cards.map((c: any) => c.id)).toEqual([custA.cardId]);
    const secrets = await sqlAs(db, custA.customer, `select card_id from public.card_secrets`);
    expect(secrets).toHaveLength(1);
    expect(await rpc(db, custA.customer, 'get_my_card', { p_card: custB.cardId })).toBeNull();
  });

  test('el personal del comercio no puede leer el secreto del QR', async () => {
    const rows = await sqlAs(db, A.owner, `select * from public.card_secrets`);
    expect(rows).toHaveLength(0);
  });

  test('un cliente no ve el perfil de otro', async () => {
    const rows = await sqlAs(db, custA.customer, `select id from public.profiles where id = $1`, [custB.customer]);
    expect(rows).toHaveLength(0);
  });
});

describe('escritura cruzada bloqueada', () => {
  test('B no puede crear un programa en A', async () => {
    const err = await sqlErrorAs(db, B.owner, `insert into public.programs (merchant_id, type, name, stamps_required) values ($1, 'stamps', 'Intruso', 5)`, [A.merchantId]);
    expect(err).toMatch(/row-level security/);
  });

  test('B no puede editar programas de A (0 filas afectadas)', async () => {
    await sqlAs(db, B.owner, `update public.programs set name = 'Hackeado' where id = $1`, [A.programId]);
    const [p] = await sqlAs<{ name: string }>(db, A.owner, `select name from public.programs where id = $1`, [A.programId]);
    expect(p.name).toBe('Café Frecuente');
  });

  test('B no puede crear recompensas en un programa de A', async () => {
    const err = await sqlErrorAs(db, B.owner, `insert into public.rewards (merchant_id, program_id, name, cost) values ($1, $2, 'x', 1)`, [B.merchantId, A.programId]);
    expect(err).not.toBe('NO_ERROR');
  });

  test('B no puede crear sucursales en A', async () => {
    const err = await sqlErrorAs(db, B.owner, `insert into public.branches (merchant_id, name) values ($1, 'Falsa')`, [A.merchantId]);
    expect(err).toMatch(/row-level security/);
  });

  test('B no puede vincular su sucursal a un programa de A', async () => {
    const err = await sqlErrorAs(db, B.owner, `insert into public.program_branches (program_id, branch_id, merchant_id) values ($1, $2, $3)`, [A.programId, B.branchId, B.merchantId]);
    expect(err).not.toBe('NO_ERROR');
  });
});

describe('RPC con identificadores de otro comercio', () => {
  test('B no puede sumar sellos a una tarjeta de A ni con el código ni con su propio merchant', async () => {
    const r1 = await rpc(db, B.owner, 'record_earn', { p_merchant: A.merchantId, p_branch: A.branchId, p_card_ref: custA.code, p_units: 1, p_idempotency_key: key() });
    expect(r1.error).toBe('forbidden');
    const r2 = await rpc(db, B.owner, 'record_earn', { p_merchant: B.merchantId, p_branch: B.branchId, p_card_ref: custA.code, p_units: 1, p_idempotency_key: key() });
    expect(r2.error).toBe('card_not_found');
  });

  test('el personal de B no puede usar una sucursal de A', async () => {
    const r = await rpc(db, staffB, 'record_earn', { p_merchant: B.merchantId, p_branch: A.branchId, p_card_ref: custB.code, p_units: 1, p_idempotency_key: key() });
    expect(r.error).toBe('branch_forbidden');
  });

  test('B no puede consultar estadísticas, clientes, equipo ni auditoría de A', async () => {
    for (const [fn, args] of [
      ['merchant_dashboard', { p_merchant: A.merchantId }],
      ['search_customers', { p_merchant: A.merchantId }],
      ['get_team', { p_merchant: A.merchantId }],
      ['list_audit', { p_merchant: A.merchantId }],
      ['list_transactions', { p_merchant: A.merchantId }],
      ['get_card_detail', { p_merchant: A.merchantId, p_card: custA.cardId }],
    ] as const) {
      expect(await rpcError(db, B.owner, fn, args)).toBe('forbidden');
    }
  });

  test('B no puede anular movimientos de A', async () => {
    const [tx] = await sqlAs<{ id: string }>(db, A.owner, `select id from public.card_transactions where card_id = $1 and type = 'earn'`, [custA.cardId]);
    const r = await rpc(db, B.owner, 'reverse_transaction', { p_transaction: tx.id, p_reason: 'ataque', p_idempotency_key: key() });
    expect(r.error).toBe('not_found');
  });

  test('B no puede pausar ni duplicar programas de A', async () => {
    expect(await rpcError(db, B.owner, 'set_program_status', { p_program: A.programId, p_status: 'paused' })).toBe('not_found');
    expect(await rpcError(db, B.owner, 'duplicate_program', { p_program: A.programId })).toBe('not_found');
  });

  test('B no puede invitar personas a A', async () => {
    expect(await rpcError(db, B.owner, 'invite_member', { p_merchant: A.merchantId, p_email: 'x@x.com', p_role: 'staff' })).toBe('forbidden');
  });

  test('B no puede bloquear tarjetas de A', async () => {
    expect(await rpcError(db, B.owner, 'set_card_status', { p_card: custA.cardId, p_status: 'blocked', p_reason: 'ataque' })).toBe('not_found');
  });

  test('un cliente no puede operar como personal', async () => {
    const r = await rpc(db, custA.customer, 'record_earn', { p_merchant: A.merchantId, p_branch: A.branchId, p_card_ref: custA.code, p_units: 1, p_idempotency_key: key() });
    expect(r.error).toBe('forbidden');
  });

  test('la búsqueda de clientes de B nunca devuelve clientes de A', async () => {
    const r = await rpc(db, B.owner, 'search_customers', { p_merchant: B.merchantId, p_query: 'Ana' });
    expect(r.total).toBe(0);
  });
});
