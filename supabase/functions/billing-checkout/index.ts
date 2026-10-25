// Crea una suscripción (preapproval) en Mercado Pago y devuelve la URL de pago.
// La activación real ocurre cuando llega el webhook firmado (billing-webhook).
import { adminClient, cors, fail, json, mp, requireOwner } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Método no permitido', 405);
  try {
    const { merchant_id, plan_id } = await req.json();
    if (typeof merchant_id !== 'string' || typeof plan_id !== 'string') return fail('Datos incompletos.');
    const auth = await requireOwner(req, merchant_id);
    if (auth.error) return auth.error;

    const db = adminClient();
    const { data: plan } = await db.from('plans').select('*').eq('id', plan_id).eq('active', true).maybeSingle();
    if (!plan) return fail('El plan no existe o no está disponible.');
    const { data: merchant } = await db.from('merchants').select('name, status').eq('id', merchant_id).single();
    if (merchant?.status === 'closed') return fail('El comercio está cerrado.');

    const site = Deno.env.get('SITE_URL') ?? 'http://localhost:5173';
    const pre = await mp<{ id: string; init_point: string }>('/preapproval', {
      method: 'POST',
      body: JSON.stringify({
        reason: `NOVANTIQ Fideliza · Plan ${plan.name} · ${merchant?.name}`.slice(0, 120),
        external_reference: `${merchant_id}:${plan_id}`,
        payer_email: auth.user!.email,
        back_url: `${site}/panel/suscripcion?mp=retorno`,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: Number(plan.price_ars), currency_id: 'ARS' },
        status: 'pending',
      }),
    });
    await db.from('subscriptions').update({ pending_plan_id: plan_id }).eq('merchant_id', merchant_id);
    await db.from('audit_log').insert({ merchant_id, actor_id: auth.user!.id, action: 'billing_checkout_started', entity: 'subscriptions', entity_id: merchant_id, details: { plan_id, preapproval_id: pre.id } });
    return json({ init_point: pre.init_point });
  } catch (e) {
    console.error(e);
    return fail('No pudimos iniciar el pago. Intentá nuevamente en unos minutos.', 502);
  }
});
