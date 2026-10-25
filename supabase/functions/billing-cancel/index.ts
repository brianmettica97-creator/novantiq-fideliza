// Cancela la suscripción en Mercado Pago. El servicio sigue hasta current_period_end.
import { adminClient, cors, fail, json, mp, requireOwner } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { merchant_id } = await req.json();
    const auth = await requireOwner(req, merchant_id);
    if (auth.error) return auth.error;
    const db = adminClient();
    const { data: sub } = await db.from('subscriptions').select('*').eq('merchant_id', merchant_id).single();
    if (!sub?.provider_subscription_id) return fail('No hay una suscripción de Mercado Pago activa.');
    await mp(`/preapproval/${sub.provider_subscription_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
    // Se mantiene 'active' hasta el fin del período pago: merchant_operational_status lo resuelve por fecha.
    await db.from('subscriptions').update({ cancel_at_period_end: true }).eq('merchant_id', merchant_id);
    await db.from('audit_log').insert({ merchant_id, actor_id: auth.user!.id, action: 'billing_cancelled', entity: 'subscriptions', entity_id: merchant_id, details: {} });
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return fail('No pudimos cancelar la suscripción. Escribinos a soporte.', 502);
  }
});
