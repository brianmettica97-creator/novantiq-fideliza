import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../lib/api';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', loading, block, icon, className = '', children, disabled, ...rest }: BtnProps) {
  const cls = ['btn', variant !== 'secondary' && `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'secondary', size = 'md', children, icon, block }: { to: string; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; children: ReactNode; icon?: ReactNode; block?: boolean }) {
  const cls = ['btn', variant !== 'secondary' && `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block'].filter(Boolean).join(' ');
  return <Link to={to} className={cls}>{icon}{children}</Link>;
}

interface FieldProps { label?: ReactNode; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode }
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {children(id)}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ label, hint, error, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => <input id={id} className={`input ${className}`} aria-invalid={error ? true : undefined} {...rest} />}
    </Field>
  );
}

export function Textarea({ label, hint, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => <textarea id={id} className="textarea" {...rest} />}
    </Field>
  );
}

export function Select({ label, hint, error, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => <select id={id} className="select input" {...rest}>{children}</select>}
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      {(id) => (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
          <input className="input mono" value={value} maxLength={7} onChange={(e) => /^#[0-9A-Fa-f]{0,6}$/.test(e.target.value) && onChange(e.target.value.toUpperCase())} aria-label={`${label} (hex)`} />
        </div>
      )}
    </Field>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'ok' | 'err' | 'warn'; children: ReactNode }) {
  const Icon = { info: Info, ok: CheckCircle2, err: AlertCircle, warn: AlertTriangle }[kind];
  return <div className={`alert alert-${kind}`} role={kind === 'err' ? 'alert' : undefined}><Icon size={18} /><div>{children}</div></div>;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <Alert kind="err">
      {errorMessage(error)}
      {onRetry && <div className="mt-1"><Button size="sm" onClick={onRetry}>Reintentar</Button></div>}
    </Alert>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return <span className="row"><span className="spinner" aria-hidden /><span className="muted">{label}</span></span>;
}

export function Loading() {
  return <div className="loading-screen"><Spinner /></div>;
}

export function Skeleton({ h = 18, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p className="muted" style={{ maxWidth: 460, margin: '0 auto 16px' }}>{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Badge({ kind, children }: { kind?: 'ok' | 'err' | 'warn' | 'lime' | ''; children: ReactNode }) {
  return <span className={`badge ${kind ? `badge-${kind}` : ''}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="row-between mb-2">
          <h3 className="mb-0">{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="stack">{children}</div>
        {footer && <div className="row mt-3" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}

/** Modal de confirmación con motivo opcional. */
export function ConfirmModal({ open, title, body, confirmLabel = 'Confirmar', danger, requireReason, onConfirm, onClose }: {
  open: boolean; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; requireReason?: boolean;
  onConfirm: (reason: string) => Promise<void> | void; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setReason(''); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={title} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={requireReason && reason.trim().length < 3}
          onClick={async () => { setBusy(true); try { await onConfirm(reason.trim()); } finally { setBusy(false); } }}>
          {confirmLabel}
        </Button>
      </>
    }>
      {body}
      {requireReason && <Textarea label="Motivo (queda registrado)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ej.: se cargó dos veces por error" />}
    </Modal>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.id} role="tab" className="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)}>{it.label}</button>
      ))}
    </div>
  );
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Field label={label}>
      {(id) => (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input id={id} className="input mono" readOnly value={value} onFocus={(e) => e.target.select()} />
          <Button onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
      )}
    </Field>
  );
}
