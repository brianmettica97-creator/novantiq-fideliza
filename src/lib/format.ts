const dateFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const moneyFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('es-AR');

export const fmtDate = (v?: string | null) => (v ? dateFmt.format(new Date(v)) : '—');
export const fmtDateTime = (v?: string | null) => (v ? dateTimeFmt.format(new Date(v)) : '—');
export const fmtMoney = (v?: number | string | null) => (v == null ? '—' : moneyFmt.format(Number(v)));
export const fmtNum = (v?: number | string | null) => (v == null ? '—' : numFmt.format(Number(v)));

export function fmtRelative(v?: string | null): string {
  if (!v) return 'Nunca';
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  if (diff < 60) return 'Hace instantes';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 30) return `Hace ${Math.floor(diff / 86400)} días`;
  return fmtDate(v);
}

export function daysUntil(v?: string | null): number | null {
  if (!v) return null;
  return Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
}

/** Convierte "2026-10-25T13:00" (input datetime-local) <-> ISO */
export const toLocalInput = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    // Evita inyección de fórmulas al abrir en Excel
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = [headers.join(';'), ...rows.map((r) => headers.map((h) => esc(r[h])).join(';'))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function initials(name?: string | null): string {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}
