/** Solo se permiten redirecciones internas (evita open redirect). */
export function safeNext(v: string | null): string {
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/inicio';
}
