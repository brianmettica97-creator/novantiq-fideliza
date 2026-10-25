// Estados de suscripción y paridad de permisos entre frontend y base.
import { beforeAll, describe, expect, test } from 'vitest';
import { ALL_PERMISSIONS, ALL_ROLES, roleCan } from '../../src/lib/permissions';
import { createDb, setupMerchant, type Db } from './harness';

let db: Db;
beforeAll(async () => { db = await createDb(); }, 60000);

const status = async (m: string) => (await db.query<{ s: string }>(`select public.merchant_operational_status($1) s`, [m])).rows[0].s;
const setSub = (m: string, sql: string) => db.query(`update public.subscriptions set ${sql} where merchant_id = $1`, [m]);

describe('estado operativo según la suscripción', () => {
  test('activa, pago pendiente con gracia, cancelada con período vigente y vencida', async () => {
    const { merchantId: m } = await setupMerchant(db, 'Facturación');
    expect(await status(m)).toBe('ok'); // prueba gratuita
    await setSub(m, `status = 'active', current_period_end = now() + interval '20 days'`);
    expect(await status(m)).toBe('ok');
    await setSub(m, `status = 'past_due', current_period_end = now() - interval '3 days'`);
    expect(await status(m)).toBe('ok'); // dentro de los 7 días de gracia
    await setSub(m, `status = 'past_due', current_period_end = now() - interval '10 days'`);
    expect(await status(m)).toBe('subscription_inactive');
    await setSub(m, `status = 'cancelled', current_period_end = now() + interval '5 days'`);
    expect(await status(m)).toBe('ok');
    await setSub(m, `status = 'cancelled', current_period_end = now() - interval '1 day'`);
    expect(await status(m)).toBe('subscription_inactive');
  });

  test('billing_apply_update (service_role) activa la suscripción', async () => {
    const { merchantId: m } = await setupMerchant(db, 'Pago MP');
    await db.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      await tx.query(`select public.billing_apply_update($1, 'multisucursal', 'active', 'pre_123', 'a@b.com', now() + interval '30 days', now())`, [m]);
    });
    const [s] = (await db.query<any>(`select plan_id, status, provider_subscription_id from public.subscriptions where merchant_id = $1`, [m])).rows;
    expect(s).toEqual({ plan_id: 'multisucursal', status: 'active', provider_subscription_id: 'pre_123' });
  });
});

test('la matriz de permisos del frontend coincide con la del servidor', async () => {
  for (const role of ALL_ROLES) {
    for (const perm of ALL_PERMISSIONS) {
      const [r] = (await db.query<{ ok: boolean }>(`select public.role_has_permission($1, $2) ok`, [role, perm])).rows;
      expect([role, perm, r.ok]).toEqual([role, perm, roleCan(role, perm)]);
    }
  }
});
