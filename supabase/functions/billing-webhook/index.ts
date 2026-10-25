// Recibe notificaciones de Mercado Pago, verifica la firma, consulta el estado real
// en la API (nunca confía en el cuerpo recibido) y actualiza la suscripción.
// Configurar en Mercado Pago > Webhooks: URL de esta función, eventos "Planes y suscripciones".
import { adminClient, json, mp, verifyMpSignature } from '../_shared/common.ts';

const STATUS: Record<string, string> = { authorized: 'active', paused: 'paused', cancelled: 'cancelled', pending: 'trialing' };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const type: string = body.type ?? url.searchParams.get('type') ?? '';
  const dataId: string = String(url.searchParams.get('data.id') ?? body?.data?.id ?? '');
  if (!dataId) return json({ ignored: true });
  if (!(await verifyMpSignature(req, dataId))) return json({ message: 'firma inválida' }, 401);

  const db = adminClient();
  const eventId = `${type}:${dataId}:${req.headers.get('x-request-id') ?? ''}`;
  const { error: dupErr } = await db.from('billing_events').insert({ provider: 'mercadopago', provider_event_id: eventId, event_type: type, payload: body });
  if (dupErr?.code === '23505') return json({ duplicate: true });

  try {
    let merchantId: string | null = null;
    if (type === 'subscription_preapproval' || type === 'preapproval') {
      const pre = await mp<any>(`/preapproval/${dataId}`);
      const [mId, planId] = String(pre.external_reference ?? '').split(':');
      merchantId = mId;
      const { data: sub } = await db.from('subscriptions').select('*').eq('merchant_id', mId).maybeSingle();
      if (!sub) throw new Error(`Suscripción inexistente para ${mId}`);
      const status = STATUS[pre.status] ?? 'past_due';
      // Si es un preapproval viejo (reemplazado por un cambio de plan), solo se ignora.
      if (sub.provider_subscription_id && sub.provider_subscription_id !== pre.id && status !== 'active') {
        await db.from('billing_events').update({ processed_at: new Date().toISOString(), merchant_id: mId }).eq('provider_event_id', eventId);
        return json({ ok: true, stale: true });
      }
      if (pre.status === 'pending') return json({ ok: true, pending: true });
      // Cambio de plan: al autorizarse el nuevo, se cancela el anterior para no cobrar dos veces.
      if (status === 'active' && sub.provider_subscription_id && sub.provider_subscription_id !== pre.id) {
        await mp(`/preapproval/${sub.provider_subscription_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }).catch(console.error);
      }
      const { error } = await db.rpc('billing_apply_update', {
        p_merchant: mId, p_plan: planId || sub.plan_id, p_status: status, p_provider_subscription_id: pre.id,
        p_payer_email: pre.payer_email ?? null, p_period_end: pre.next_payment_date ?? null, p_paid_at: null,
      });
      if (error) throw error;
    } else if (type === 'subscription_authorized_payment') {
      const pay = await mp<any>(`/authorized_payments/${dataId}`);
      const { data: sub } = await db.from('subscriptions').select('*').eq('provider_subscription_id', pay.preapproval_id).maybeSingle();
      if (sub) {
        merchantId = sub.merchant_id;
        const approved = pay.payment?.status === 'approved' || pay.status === 'processed';
        const pre = await mp<any>(`/preapproval/${pay.preapproval_id}`);
        const { error } = await db.rpc('billing_apply_update', {
          p_merchant: sub.merchant_id, p_plan: sub.plan_id, p_status: approved ? 'active' : 'past_due',
          p_provider_subscription_id: pay.preapproval_id, p_payer_email: null, p_period_end: pre.next_payment_date ?? null,
          p_paid_at: approved ? new Date().toISOString() : null,
        });
        if (error) throw error;
      }
    }
    await db.from('billing_events').update({ processed_at: new Date().toISOString(), merchant_id: merchantId }).eq('provider_event_id', eventId);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    await db.from('billing_events').update({ error: String(e).slice(0, 500) }).eq('provider_event_id', eventId);
    // 500 => Mercado Pago reintenta la notificación
    return json({ message: 'error procesando' }, 500);
  }
});
