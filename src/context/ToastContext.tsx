import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

type Kind = 'ok' | 'err' | 'info';
interface Toast { id: number; kind: Kind; text: string }
interface ToastApi { ok: (t: string) => void; err: (t: string) => void; info: (t: string) => void }

const Ctx = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Kind, text: string) => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 6500 : 4000);
  }, []);
  const api: ToastApi = {
    ok: (t) => push('ok', t),
    err: (t) => push('err', t),
    info: (t) => push('info', t),
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === 'ok' ? <CheckCircle2 size={18} color="var(--ok)" /> : t.kind === 'err' ? <AlertCircle size={18} color="var(--err)" /> : <Info size={18} color="var(--info)" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast fuera de ToastProvider');
  return v;
}
