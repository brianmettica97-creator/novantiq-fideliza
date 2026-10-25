import { supabase } from './supabase';

/** Error con mensaje listo para mostrar al usuario. */
export class AppError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const FRIENDLY: Record<string, string> = {
  not_authenticated: 'Tu sesión expiró. Iniciá sesión nuevamente.',
  forbidden: 'No tenés permiso para realizar esta acción.',
  rate_limited: 'Demasiados intentos seguidos. Esperá unos minutos.',
  'Failed to fetch': 'No pudimos conectarnos. Revisá tu conexión a internet.',
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada.',
  'User already registered': 'Ya existe una cuenta con ese correo. Iniciá sesión.',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 8 caracteres.',
  'New password should be different from the old password.': 'La nueva contraseña debe ser distinta de la anterior.',
  'Email rate limit exceeded': 'Se enviaron demasiados correos. Esperá unos minutos.',
  'email rate limit exceeded': 'Se enviaron demasiados correos. Esperá unos minutos.',
  plan_feature: 'Esta función no está incluida en tu plan.',
};

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const e = err as { message?: string; details?: string; code?: string; error?: string };
  const code = e?.message || e?.error || 'unknown';
  // Errores de negocio de la base: message = código, details = texto en español
  if (e?.details && /^[a-z_]+$/.test(code)) return new AppError(code, e.details);
  if (FRIENDLY[code]) return new AppError(code, FRIENDLY[code]);
  if (/duplicate key value/.test(code)) return new AppError('duplicate', 'Ya existe un registro con esos datos.');
  if (/violates check constraint/.test(code)) return new AppError('invalid', 'Algún dato no tiene un formato válido. Revisá el formulario.');
  if (/row-level security|permission denied/.test(code)) return new AppError('forbidden', FRIENDLY.forbidden);
  if (/JWT|jwt/.test(code)) return new AppError('not_authenticated', FRIENDLY.not_authenticated);
  return new AppError(code, 'Ocurrió un error inesperado. Intentá nuevamente.');
}

export function errorMessage(err: unknown): string {
  return toAppError(err).message;
}

/** RPC que lanza AppError ante cualquier fallo. */
export async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toAppError(error);
  return data as T;
}

export type OpResult<T = Record<string, any>> = ({ ok: true } & T) | { ok: false; error: string; message: string };

/** RPC operativa: devuelve {ok:false,...} en vez de lanzar, para mostrar el motivo en mostrador. */
export async function opRpc<T = Record<string, any>>(fn: string, args: Record<string, unknown>): Promise<OpResult<T>> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      const e = toAppError(error);
      return { ok: false, error: e.code, message: e.message };
    }
    return data as OpResult<T>;
  } catch (err) {
    const e = toAppError(err);
    return { ok: false, error: e.code, message: e.message };
  }
}

/** Ejecuta una consulta de supabase-js y lanza AppError si falla. */
export async function q<T>(promise: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw toAppError(error);
  return data as T;
}

/** Clave de idempotencia para una intención de operación. */
export function newIdempotencyKey(): string {
  return `op_${crypto.randomUUID()}`;
}

export async function callFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = 'No se pudo completar la operación con el proveedor de pagos.';
    try {
      const ctx = await (error as any).context?.json?.();
      if (ctx?.message) msg = ctx.message;
    } catch { /* sin cuerpo */ }
    throw new AppError('function_error', msg);
  }
  return data as T;
}
