// Roles, permisos y escalada de privilegios.
import { beforeAll, describe, expect, test } from 'vitest';
import { addMember, createUser, createDb, joinAsCustomer, key, rpc, rpcError, setupMerchant, sqlAs, sqlErrorAs, type Db } from './harness';

let db: Db;
let M: Awaited<ReturnType<typeof setupMerchant>>;
let admin: string, manager: string, staff: string;

beforeAll(async () => {
  db = await createDb();
  M = await setupMerchant(db, 'Barbería Norte');
  admin = await addMember(db, M.owner, M.merchantId, 'admin');
  manager = await addMember(db, M.owner, M.merchantId, 'manager');
  staff = await addMember(db, M.owner, M.merchantId, 'staff');
}, 60000);

describe('no se pueden escalar privilegios', () => {
  test('nadie puede escribir memberships directamente', async () => {
    expect(await sqlErrorAs(db, staff, `update public.memberships set role = 'owner' where user_id = auth.uid()`)).toMatch(/permission denied/);
    expect(await sqlErrorAs(db, staff, `insert into public.memberships (merchant_id, user_id, role) values ($1, auth.uid(), 'admin')`, [M.merchantId])).toMatch(/permission denied/);
    expect(await sqlErrorAs(db, admin, `delete from public.memberships where role = 'owner'`)).toMatch(/permission denied/);
  });

  test('nadie puede autoasignarse administrador global', async () => {
    expect(await sqlErrorAs(db, M.owner, `insert into public.platform_admins (user_id) values (auth.uid())`)).toMatch(/permission denied/);
    expect(await rpcError(db, M.owner, 'admin_overview')).toBe('forbidden');
  });

  test('el perfil solo permite editar nombre, teléfono y preferencia', async () => {
    expect(await sqlErrorAs(db, staff, `update public.profiles set email = 'otro@x.com' where id = auth.uid()`)).toMatch(/permission denied/);
    await sqlAs(db, staff, `update public.profiles set full_name = 'Nuevo nombre' where id = auth.uid()`);
  });

  test('el comercio no puede cambiar su estado, zona horaria ni suscripción', async () => {
    expect(await sqlErrorAs(db, M.owner, `update public.merchants set status = 'active' where id = $1`, [M.merchantId])).toMatch(/permission denied/);
    expect(await sqlErrorAs(db, M.owner, `update public.subscriptions set status = 'active', plan_id = 'multisucursal'`)).toMatch(/permission denied/);
  });

  test('no se puede publicar un programa ni tocar saldos con UPDATE directo', async () => {
    expect(await sqlErrorAs(db, M.owner, `update public.programs set status = 'active' where id = $1`, [M.programId])).toMatch(/permission denied/);
    expect(await sqlErrorAs(db, M.owner, `update public.cards set balance = 999`)).toMatch(/permission denied/);
    expect(await sqlErrorAs(db, M.owner, `insert into public.card_transactions (merchant_id) values ($1)`, [M.merchantId])).toMatch(/permission denied/);
  });

  test('nadie modifica su propio rol con update_member', async () => {
    const [me] = await sqlAs<{ id: string }>(db, admin, `select id from public.memberships where user_id = auth.uid()`);
    expect(await rpcError(db, admin, 'update_member', { p_membership: me.id, p_role: 'admin', p_status: 'active', p_all_branches: true })).toBe('self_change');
  });

  test('un admin no puede crear ni gestionar otros admins, ni tocar al titular', async () => {
    expect(await rpcError(db, admin, 'invite_member', { p_merchant: M.merchantId, p_email: 'nuevo@x.com', p_role: 'admin' })).toBe('forbidden_role');
    const [ownerM] = await sqlAs<{ id: string }>(db, M.owner, `select id from public.memberships where role = 'owner' and merchant_id = $1`, [M.merchantId]);
    expect(await rpcError(db, admin, 'remove_member', { p_membership: ownerM.id })).toBe('forbidden');
    const [staffM] = await sqlAs<{ id: string }>(db, M.owner, `select id from public.memberships where user_id = $1`, [staff]);
    expect(await rpcError(db, admin, 'update_member', { p_membership: staffM.id, p_role: 'admin', p_status: 'active', p_all_branches: true })).toBe('forbidden_role');
  });

  test('empleados y encargados no gestionan el equipo ni la configuración', async () => {
    for (const u of [staff, manager]) {
      expect(await rpcError(db, u, 'invite_member', { p_merchant: M.merchantId, p_email: 'z@x.com', p_role: 'staff' })).toBe('forbidden');
      expect(await sqlErrorAs(db, u, `insert into public.branches (merchant_id, name) values ($1, 'Otra')`, [M.merchantId])).toMatch(/row-level security/);
      await sqlAs(db, u, `update public.programs set name = 'Cambiado' where id = $1`, [M.programId]);
    }
    const [p] = await sqlAs<{ name: string }>(db, M.owner, `select name from public.programs where id = $1`, [M.programId]);
    expect(p.name).toBe('Café Frecuente');
  });

  test('un empleado no ve estadísticas ni auditoría, pero sí opera', async () => {
    expect(await rpcError(db, staff, 'merchant_dashboard', { p_merchant: M.merchantId })).toBe('forbidden');
    expect(await rpcError(db, staff, 'list_audit', { p_merchant: M.merchantId })).toBe('forbidden');
    const c = await joinAsCustomer(db, M.joinCode);
    const r = await rpc(db, staff, 'record_earn', { p_merchant: M.merchantId, p_branch: M.branchId, p_card_ref: c.code, p_units: 1, p_idempotency_key: key() });
    expect(r.ok).toBe(true);
    // El empleado ve el email enmascarado
    const look = await rpc(db, staff, 'staff_lookup_card', { p_merchant: M.merchantId, p_branch: M.branchId, p_card_ref: c.code });
    expect(look.customer.email).toMatch(/\*\*\*@/);
  });

  test('un empleado no puede anular ni ajustar; un encargado sí', async () => {
    const c = await joinAsCustomer(db, M.joinCode);
    const r = await rpc(db, staff, 'record_earn', { p_merchant: M.merchantId, p_branch: M.branchId, p_card_ref: c.code, p_units: 1, p_idempotency_key: key() });
    expect((await rpc(db, staff, 'reverse_transaction', { p_transaction: r.transaction_id, p_reason: 'error', p_idempotency_key: key() })).error).toBe('forbidden');
    expect((await rpc(db, staff, 'adjust_balance', { p_merchant: M.merchantId, p_card: c.cardId, p_delta: 3, p_reason: 'regalo', p_idempotency_key: key() })).error).toBe('forbidden');
    expect((await rpc(db, manager, 'reverse_transaction', { p_transaction: r.transaction_id, p_reason: 'error de carga', p_idempotency_key: key() })).ok).toBe(true);
  });

  test('un integrante deshabilitado pierde el acceso', async () => {
    const temp = await addMember(db, M.owner, M.merchantId, 'staff');
    const [m] = await sqlAs<{ id: string }>(db, M.owner, `select id from public.memberships where user_id = $1`, [temp]);
    await rpc(db, M.owner, 'update_member', { p_membership: m.id, p_role: 'staff', p_status: 'disabled', p_all_branches: true });
    const c = await joinAsCustomer(db, M.joinCode);
    const r = await rpc(db, temp, 'record_earn', { p_merchant: M.merchantId, p_branch: M.branchId, p_card_ref: c.code, p_units: 1, p_idempotency_key: key() });
    expect(r.error).toBe('forbidden');
    expect(await sqlAs(db, temp, `select * from public.programs`)).toHaveLength(0);
  });
});

describe('sucursales autorizadas', () => {
  test('un empleado limitado a una sucursal no opera en otra', async () => {
    const [second] = await sqlAs<{ id: string }>(db, M.owner, `insert into public.branches (merchant_id, name) values ($1, 'Centro') returning id`, [M.merchantId]).catch(() => [{ id: '' }]);
    if (!second.id) return; // el plan inicial podría no permitir 2 sucursales
    const limited = await addMember(db, M.owner, M.merchantId, 'staff', { allBranches: false, branchIds: [second.id] });
    const c = await joinAsCustomer(db, M.joinCode);
    const bad = await rpc(db, limited, 'record_earn', { p_merchant: M.merchantId, p_branch: M.branchId, p_card_ref: c.code, p_units: 1, p_idempotency_key: key() });
    expect(bad.error).toBe('branch_forbidden');
    const ok = await rpc(db, limited, 'record_earn', { p_merchant: M.merchantId, p_branch: second.id, p_card_ref: c.code, p_units: 1, p_idempotency_key: key() });
    expect(ok.ok).toBe(true);
  });
});

describe('invitaciones', () => {
  test('una invitación solo la acepta el correo invitado, una sola vez', async () => {
    const inv = await rpc(db, M.owner, 'invite_member', { p_merchant: M.merchantId, p_email: 'invitada@test.local', p_role: 'staff' });
    const intruder = await createUser(db, { email: 'otro@test.local' });
    expect(await rpcError(db, intruder, 'accept_invitation', { p_token: inv.token })).toBe('email_mismatch');
    const invited = await createUser(db, { email: 'invitada@test.local' });
    expect(await rpc(db, invited, 'accept_invitation', { p_token: inv.token })).toBe(M.merchantId);
    expect(await rpcError(db, invited, 'accept_invitation', { p_token: inv.token })).toBe('invalid_invitation');
  });

  test('una cuenta sin correo confirmado no puede aceptar', async () => {
    const inv = await rpc(db, M.owner, 'invite_member', { p_merchant: M.merchantId, p_email: 'sinconfirmar@test.local', p_role: 'staff' });
    const u = await createUser(db, { email: 'sinconfirmar@test.local', confirmed: false });
    expect(await rpcError(db, u, 'accept_invitation', { p_token: inv.token })).toBe('email_mismatch');
  });

  test('el token no se puede leer de la tabla', async () => {
    expect(await sqlErrorAs(db, M.owner, `select token_hash from public.invitations`)).toMatch(/permission denied/);
  });

  test('una invitación vencida o revocada no sirve', async () => {
    const inv = await rpc(db, M.owner, 'invite_member', { p_merchant: M.merchantId, p_email: 'vence@test.local', p_role: 'staff' });
    await db.query(`update public.invitations set expires_at = now() - interval '1 minute' where id = $1`, [inv.invitation_id]);
    const u = await createUser(db, { email: 'vence@test.local' });
    expect(await rpcError(db, u, 'accept_invitation', { p_token: inv.token })).toBe('invitation_expired');
    const inv2 = await rpc(db, M.owner, 'invite_member', { p_merchant: M.merchantId, p_email: 'revocada@test.local', p_role: 'staff' });
    await rpc(db, M.owner, 'revoke_invitation', { p_invitation: inv2.invitation_id });
    const u2 = await createUser(db, { email: 'revocada@test.local' });
    expect(await rpcError(db, u2, 'accept_invitation', { p_token: inv2.token })).toBe('invalid_invitation');
  });
});

describe('alta de comercio', () => {
  test('requiere correo confirmado', async () => {
    const u = await createUser(db, { confirmed: false });
    expect(await rpcError(db, u, 'create_merchant', { p_name: 'Sin Confirmar' })).toBe('email_not_confirmed');
  });

  test('crea titular, prueba gratuita y sucursal principal', async () => {
    const u = await createUser(db);
    const id = await rpc(db, u, 'create_merchant', { p_name: 'Panadería Del Parque', p_category: 'panaderia' });
    const mem = await rpc(db, u, 'my_memberships');
    const m = mem.find((x: any) => x.merchant_id === id);
    expect(m.role).toBe('owner');
    expect(m.subscription_status).toBe('trialing');
    expect(m.operational_status).toBe('ok');
    expect(m.slug).toBe('panaderia-del-parque');
  });

  test('limita la cantidad de comercios por cuenta', async () => {
    const u = await createUser(db);
    for (let i = 0; i < 3; i++) await rpc(db, u, 'create_merchant', { p_name: `Local ${i}` });
    expect(await rpcError(db, u, 'create_merchant', { p_name: 'Local extra' })).toBe('limit_reached');
  });
});

describe('administración global', () => {
  test('solo un admin global accede a las funciones de plataforma', async () => {
    const root = await createUser(db);
    await db.query(`insert into public.platform_admins (user_id) values ($1)`, [root]);
    const ov = await rpc(db, root, 'admin_overview');
    expect(Number(ov.merchants_total)).toBeGreaterThan(0);
    await rpc(db, root, 'admin_set_merchant_status', { p_merchant: M.merchantId, p_status: 'suspended', p_reason: 'prueba' });
    const c = await joinAsCustomer(db, (await setupMerchant(db, 'Otro')).joinCode);
    void c;
    const r = await rpc(db, staff, 'record_earn', { p_merchant: M.merchantId, p_branch: M.branchId, p_card_ref: 'AAAAAAAA', p_units: 1, p_idempotency_key: key() });
    expect(r.error).toBe('merchant_suspended');
    await rpc(db, root, 'admin_set_merchant_status', { p_merchant: M.merchantId, p_status: 'active', p_reason: '' });
  });

  test('billing_apply_update no es invocable por usuarios', async () => {
    expect(await rpcError(db, M.owner, 'billing_apply_update', {
      p_merchant: M.merchantId, p_plan: 'multisucursal', p_status: 'active', p_provider_subscription_id: 'x',
      p_payer_email: 'x@x.com', p_period_end: new Date().toISOString(),
    })).toMatch(/permission denied/);
  });
});
