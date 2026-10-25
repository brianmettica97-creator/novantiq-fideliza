// QR rotativo de la tarjeta del cliente.
// Formato: NF1.<public_token>.<paso>.<firma>
//   paso  = floor(segundos_unix / 30)
//   firma = primeros 16 hex de HMAC-SHA256(secret, `${token}.${paso}`)
// El servidor (public.resolve_card_ref) recalcula la firma y rechaza QR vencidos,
// por lo que una captura de pantalla deja de servir a los pocos minutos.

export const QR_STEP_SECONDS = 30;

export function currentStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / QR_STEP_SECONDS);
}

export function secondsToNextStep(nowMs: number = Date.now()): number {
  return QR_STEP_SECONDS - (Math.floor(nowMs / 1000) % QR_STEP_SECONDS);
}

export async function qrSignature(secret: string, token: string, step: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${token}.${step}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export async function buildCardQrPayload(secret: string, token: string, nowMs: number = Date.now()): Promise<string> {
  const step = currentStep(nowMs);
  return `NF1.${token}.${step}.${await qrSignature(secret, token, step)}`;
}

/** Distingue un QR de tarjeta, un enlace de inscripción o un código manual. */
export function classifyScan(raw: string): { kind: 'card'; value: string } | { kind: 'join'; code: string } | { kind: 'unknown'; value: string } {
  const value = raw.trim();
  if (/^NF1\.[0-9a-f]{32}\.\d{1,12}\.[0-9a-f]{16}$/i.test(value)) return { kind: 'card', value };
  const join = value.match(/\/unirse\/([0-9a-f]{32})/i);
  if (join) return { kind: 'join', code: join[1] };
  return { kind: 'unknown', value };
}

/** Normaliza un código manual (igual que public.normalize_card_code). */
export function normalizeCardCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function formatCardCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
