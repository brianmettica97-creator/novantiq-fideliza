import { useState, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Building2, CreditCard, FileClock, Gift, Home, LifeBuoy, LogOut, Megaphone, Menu, QrCode, ReceiptText, ScanLine, Settings, Share2, Users, UsersRound, X } from 'lucide-react';
import { BrandLogo } from '../components/Brand';
import { Alert, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useMerchant } from '../context/MerchantContext';
import type { Permission } from '../lib/permissions';
import { ROLE_LABEL } from '../lib/permissions';
import { daysUntil } from '../lib/format';

interface Item { to: string; label: string; icon: ReactNode; perm?: Permission; feature?: string; end?: boolean }

const ITEMS: { section: string; items: Item[] }[] = [
  { section: 'Operación', items: [
    { to: '/operar', label: 'Mostrador', icon: <ScanLine size={18} />, perm: 'operate' },
    { to: '/panel', label: 'Inicio', icon: <Home size={18} />, perm: 'stats', end: true },
    { to: '/panel/clientes', label: 'Clientes', icon: <Users size={18} />, perm: 'customers.view' },
    { to: '/panel/movimientos', label: 'Movimientos', icon: <ReceiptText size={18} />, perm: 'stats' },
  ] },
  { section: 'Fidelización', items: [
    { to: '/panel/tarjetas', label: 'Tarjetas y recompensas', icon: <Gift size={18} />, perm: 'config' },
    { to: '/panel/promociones', label: 'Promociones', icon: <Megaphone size={18} />, perm: 'config' },
    { to: '/panel/compartir', label: 'Compartir y QR', icon: <Share2 size={18} />, perm: 'config' },
  ] },
  { section: 'Comercio', items: [
    { to: '/panel/equipo', label: 'Equipo', icon: <UsersRound size={18} />, perm: 'team' },
    { to: '/panel/sucursales', label: 'Sucursales', icon: <Building2 size={18} />, perm: 'config' },
    { to: '/panel/configuracion', label: 'Configuración', icon: <Settings size={18} />, perm: 'config' },
    { to: '/panel/suscripcion', label: 'Suscripción', icon: <CreditCard size={18} />, perm: 'billing' },
    { to: '/panel/auditoria', label: 'Auditoría', icon: <FileClock size={18} />, perm: 'audit' },
    { to: '/panel/soporte', label: 'Soporte', icon: <LifeBuoy size={18} /> },
  ] },
];

export function PanelLayout() {
  const { user, loading: authLoading, signOut, isPlatformAdmin } = useAuth();
  const { loading, memberships, current, select, can } = useMerchant();
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  if (authLoading || loading) return <Loading />;
  if (!user) return <Navigate to={`/ingresar?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!current) return <Navigate to="/crear-comercio" replace />;
  if (can('config') && !current.onboarding_completed_at && !loc.pathname.startsWith('/panel/onboarding')
      && loc.pathname !== '/operar') {
    return <Navigate to="/panel/onboarding" replace />;
  }

  const visible = ITEMS.map((s) => ({ ...s, items: s.items.filter((i) => (!i.perm || can(i.perm))) })).filter((s) => s.items.length);
  const trialDays = current.subscription_status === 'trialing' ? daysUntil(current.trial_ends_at) : null;

  const nav = (
    <>
      <div className="row-between">
        <BrandLogo to="/panel" />
        <button className="btn btn-ghost btn-icon mobile-only" onClick={() => setOpen(false)} aria-label="Cerrar menú" style={{ display: open ? 'inline-flex' : 'none' }}><X size={18} /></button>
      </div>
      {memberships.length > 1 ? (
        <select className="input" value={current.merchant_id} onChange={(e) => { select(e.target.value); setOpen(false); }} aria-label="Comercio">
          {memberships.map((m) => <option key={m.merchant_id} value={m.merchant_id}>{m.name}</option>)}
        </select>
      ) : (
        <div className="card card-tight"><div style={{ fontWeight: 600 }}>{current.name}</div><div className="small muted">{ROLE_LABEL[current.role]}</div></div>
      )}
      {visible.map((s) => (
        <nav key={s.section} className="side-nav" aria-label={s.section}>
          <div className="side-section">{s.section}</div>
          {s.items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setOpen(false)}>{i.icon}{i.label}</NavLink>
          ))}
        </nav>
      ))}
      <nav className="side-nav" style={{ marginTop: 'auto' }}>
        {isPlatformAdmin && <NavLink to="/admin"><BarChart3 size={18} />Admin NOVANTIQ</NavLink>}
        <NavLink to="/mis-tarjetas"><QrCode size={18} />Mis tarjetas</NavLink>
        <a href="#" onClick={(e) => { e.preventDefault(); signOut(); }}><LogOut size={18} />Cerrar sesión</a>
      </nav>
    </>
  );

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>{nav}</aside>
      <div>
        <div className="mobile-bar">
          <BrandLogo to="/panel" compact />
          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.name}</span>
          <button className="btn btn-ghost btn-icon" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button>
        </div>
        <main className="main">
          {current.operational_status !== 'ok' && (
            <div className="mb-2"><Alert kind="err">
              {current.operational_status === 'trial_expired' ? 'Tu prueba gratuita terminó. Las operaciones están pausadas hasta activar una suscripción.'
                : current.operational_status === 'suspended' ? 'La cuenta está suspendida. Contactá a soporte.'
                : 'La suscripción no está activa. Las operaciones están pausadas.'}
              {can('billing') && <> <NavLink to="/panel/suscripcion">Ver suscripción</NavLink></>}
            </Alert></div>
          )}
          {trialDays != null && trialDays <= 5 && trialDays > 0 && can('billing') && (
            <div className="mb-2"><Alert kind="warn">Te quedan {trialDays} día(s) de prueba. <NavLink to="/panel/suscripcion">Elegí un plan</NavLink> para no interrumpir el servicio.</Alert></div>
          )}
          <Outlet />
        </main>
        <nav className="bottom-nav" aria-label="Accesos rápidos">
          {can('operate') && <NavLink to="/operar"><ScanLine size={20} />Mostrador</NavLink>}
          {can('stats') && <NavLink to="/panel" end><Home size={20} />Inicio</NavLink>}
          {can('customers.view') && <NavLink to="/panel/clientes"><Users size={20} />Clientes</NavLink>}
          {can('config') && <NavLink to="/panel/tarjetas"><Gift size={20} />Tarjetas</NavLink>}
          <a href="#" onClick={(e) => { e.preventDefault(); setOpen(true); }}><Menu size={20} />Más</a>
        </nav>
      </div>
    </div>
  );
}
