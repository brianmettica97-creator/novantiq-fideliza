import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { rpc } from '../lib/api';
import { roleCan, type Permission } from '../lib/permissions';
import type { Membership } from '../lib/types';
import { useAuth } from './AuthContext';

interface MerchantState {
  loading: boolean;
  memberships: Membership[];
  current: Membership | null;
  merchantId: string | null;
  select: (merchantId: string) => void;
  refresh: () => Promise<Membership[]>;
  can: (perm: Permission) => boolean;
  hasFeature: (feature: string) => boolean;
}

const Ctx = createContext<MerchantState | null>(null);
const KEY = 'nf.merchant';

function readStored(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function MerchantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selected, setSelected] = useState<string | null>(readStored());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return [];
    }
    try {
      const list = await rpc<Membership[]>('my_memberships');
      setMemberships(list ?? []);
      return list ?? [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    refresh().catch(() => setMemberships([]));
  }, [refresh]);

  const current = useMemo(
    () => memberships.find((m) => m.merchant_id === selected) ?? memberships[0] ?? null,
    [memberships, selected],
  );

  const value = useMemo<MerchantState>(() => ({
    loading,
    memberships,
    current,
    merchantId: current?.merchant_id ?? null,
    select: (id: string) => {
      setSelected(id);
      try { localStorage.setItem(KEY, id); } catch { /* almacenamiento no disponible */ }
    },
    refresh,
    can: (perm) => roleCan(current?.role, perm),
    hasFeature: (f) => !!current?.features?.[f],
  }), [loading, memberships, current, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMerchant() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMerchant fuera de MerchantProvider');
  return v;
}
