// Derecho de supresión (Ley 25.326): elimina la cuenta del usuario autenticado.
// Bloquea la eliminación si es titular de un comercio activo (debe cerrarlo antes).
import { adminClient, cors, fail, json, requireUser } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await requireUser(req);
  if (!user) return fail('Sesión inválida.', 401);
  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== 'ELIMINAR') return fail('Confirmación requerida.');
  const db = adminClient();
  const { data: owned } = await db.from('memberships').select('merchant_id, merchants!inner(status)').eq('user_id', user.id).eq('role', 'owner');
  if ((owned ?? []).some((o: any) => o.merchants.status !== 'closed')) {
    return fail('Sos titular de un comercio activo. Cancelá la suscripción y pedí el cierre del comercio a soporte antes de eliminar tu cuenta.', 409);
  }
  await db.from('audit_log').insert({ actor_id: user.id, action: 'account_deleted', entity: 'auth.users', entity_id: user.id, details: {} });
  // Perfil, tarjetas y sus movimientos se eliminan en cascada. Las operaciones que esta persona
  // registró como empleado se conservan con performed_by = null.
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return fail('No se pudo eliminar la cuenta. Escribinos a soporte.', 500);
  return json({ ok: true });
});
