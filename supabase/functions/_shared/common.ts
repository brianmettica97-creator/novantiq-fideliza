// Utilidades compartidas por las Edge Functions (Deno).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') ?? '*';

export const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export function fail(message: string, status = 400): Response {
  return json({ message }, status);
}

/** Cliente con service_role: ignora RLS. Usar solo después de autorizar. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

/** Devuelve el usuario autenticado a partir del JWT del encabezado Authorization. */
export async function requireUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function requireOwner(req: Request, merchantId: string) {
  const user = await requireUser(req);
  if (!user) return { error: fail('Sesión inválida.', 401) };
  const { data } = await adminClient().from('memberships').select('role, status')
    .eq('merchant_id', merchantId).eq('user_id', user.id).maybeSingle();
  if (!data || data.role !== 'owner' || data.status !== 'active') return { error: fail('Solo el titular puede gestionar la suscripción.', 403) };
  return { user };
}

// ---------------------------------------------------------------- Mercado Pago
const MP_API = 'https://api.mercadopago.com';

export async function mp<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = Deno.env.get('MP_ACCESS_TOKEN');
  if (!token) throw new Error('MP_ACCESS_TOKEN no configurado');
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body as T;
}

/** Verifica la firma x-signature de las notificaciones de Mercado Pago. */
export async function verifyMpSignature(req: Request, dataId: string): Promise<boolean> {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET');
  if (!secret) return false;
  const sig = req.headers.get('x-signature') ?? '';
  const requestId = req.headers.get('x-request-id') ?? '';
  const parts = Object.fromEntries(sig.split(',').map((p) => p.trim().split('=') as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  // Rechaza notificaciones con más de 10 minutos (reenvío/replay)
  const tsMs = Number(parts.ts) < 1e12 ? Number(parts.ts) * 1000 : Number(parts.ts);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}
