import { useState } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '../../components/Brand';
import { Badge, Button, Checkbox, ErrorBox, Input, Loading, Modal, PageHeader, Select, Stat, Tabs, Textarea } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage, q, rpc } from '../../lib/api';
import { categoryLabel } from '../../lib/constants';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtRelative, toLocalInput, fromLocalInput } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import type { Plan } from '../../lib/types';
import { AuditList } from '../panel/Management';

/** La interfaz se oculta a no administradores; la protección real está en las funciones SQL (assert_platform_admin). */
export function AdminLayout() {
  const { isPlatformAdmin, loading, user } = useAuth();
  if (loading) return <Loading />;
  if (!user || !isPlatformAdmin) return <Navigate to="/inicio" replace />;
  return (
    <>
      <header className="topbar"><div className="container topbar-inner">
        <div className="row"><BrandLogo to="/admin" /><Badge kind="lime">Administración</Badge></div>
        <nav className="nav-links" style={{ overflowX: 'auto' }}>
          <NavLink to="/admin" end>Resumen</NavLink><NavLink to="/admin/comercios">Comercios</NavLink><NavLink to="/admin/planes">Planes</NavLink>
          <NavLink to="/admin/soporte">Soporte</NavLink><NavLink to="/admin/auditoria">Auditoría</NavLink><NavLink to="/admin/ajustes">Ajustes</NavLink>
          <NavLink to="/inicio"><ArrowLeft size={14} style={{ display: 'inline' }} /> Salir</NavLink>
        </nav>
      </div></header>
      <main className="container" style={{ padding: '28px 20px 60px' }}><Outlet /></main>
    </>
  );
}

export function AdminHome() {
  const { data: d, error, loading, reload } = useAsync(() => rpc<any>('admin_overview'), []);
  if (loading) return <Loading />;
  if (!d) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <>
      <PageHeader title="Resumen de la plataforma" />
      <div className="grid-4">
        <Stat label="Comercios" value={fmtNum(d.merchants_total)} hint={`+${d.merchants_new_30d} últimos 30 días`} />
        <Stat label="Ingreso mensual recurrente" value={fmtMoney(d.mrr_ars)} hint="Suscripciones activas" />
        <Stat label="Suscripciones activas" value={fmtNum(d.subscriptions_by_status.active ?? 0)} hint={`${d.subscriptions_by_status.trialing ?? 0} en prueba · ${d.trials_ending_7d} vencen en 7 días`} />
        <Stat label="Pagos pendientes" value={fmtNum(d.subscriptions_by_status.past_due ?? 0)} />
        <Stat label="Clientes finales" value={fmtNum(d.customers_total)} hint={`${fmtNum(d.cards_total)} tarjetas`} />
        <Stat label="Compras (30 días)" value={fmtNum(d.operations_30d)} hint={`${fmtNum(d.redemptions_30d)} canjes`} />
        <Stat label="Soporte abierto" value={fmtNum(d.tickets_open)} hint={`${d.contacts_new} contactos comerciales nuevos`} />
        <Stat label="Intentos rechazados (7 días)" value={fmtNum(d.rejected_attempts_7d)} />
      </div>
    </>
  );
}

export function AdminMerchants() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const { data, error, loading, reload } = useAsync(() => rpc<any>('admin_list_merchants', { p_query: query || null, p_status: status || null, p_limit: 100, p_offset: 0 }), [status]);
  const { data: plans } = useAsync(() => q<Plan[]>(supabase.from('plans').select('*').order('sort_order')), []);
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader title="Comercios" subtitle={data && `${data.total} en total`} />
      <form className="row mb-2" onSubmit={(e) => { e.preventDefault(); reload(); }}>
        <input className="input grow" style={{ width: 'auto' }} placeholder="Buscar por nombre" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
          <option value="">Todos</option><option value="active">Activos</option><option value="suspended">Suspendidos</option><option value="trialing">En prueba</option><option value="past_due">Pago pendiente</option><option value="cancelled">Cancelados</option>
        </select>
        <Button type="submit">Buscar</Button>
      </form>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && <div className="table-wrap"><table className="table table-stack">
        <thead><tr><th>Comercio</th><th>Titular</th><th>Plan</th><th>Estado</th><th>Clientes</th><th>Última operación</th><th /></tr></thead>
        <tbody>{data.rows.map((m: any) => (
          <tr key={m.id}>
            <td data-label="Comercio"><strong>{m.name}</strong><div className="small subtle">{categoryLabel(m.category)} · alta {fmtDate(m.created_at)}</div></td>
            <td data-label="Titular" className="small">{m.owner_email}</td>
            <td data-label="Plan">{m.plan_id}<div className="small subtle">{m.subscription_status}{m.subscription_status === 'trialing' ? ` hasta ${fmtDate(m.trial_ends_at)}` : ''}</div></td>
            <td data-label="Estado">{m.status === 'active' ? <Badge kind={m.operational_status === 'ok' ? 'ok' : 'warn'}>{m.operational_status === 'ok' ? 'Operativo' : m.operational_status}</Badge> : <Badge kind="err">{m.status}</Badge>}</td>
            <td data-label="Clientes">{fmtNum(m.cards)}</td>
            <td data-label="Última operación">{fmtRelative(m.last_operation_at)}</td>
            <td><Button size="sm" onClick={() => setEdit({ ...m, reason: m.status_reason ?? '' })}>Gestionar</Button></td>
          </tr>
        ))}</tbody>
      </table></div>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.name} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cerrar</Button>
        <Button variant="primary" loading={busy} onClick={async () => {
          setBusy(true);
          try {
            await rpc('admin_set_merchant_status', { p_merchant: edit.id, p_status: edit.status, p_reason: edit.reason });
            await rpc('admin_update_subscription', { p_merchant: edit.id, p_plan: edit.plan_id, p_status: edit.subscription_status, p_trial_ends_at: edit.trial_ends_at, p_period_end: edit.current_period_end });
            toast.ok('Comercio actualizado.'); setEdit(null); reload();
          } catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
        }}>Guardar</Button></>}>
        {edit && <>
          <Select label="Estado de la cuenta" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Activa</option><option value="suspended">Suspendida</option><option value="closed">Cerrada</option></Select>
          <Input label="Motivo (visible en auditoría)" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />
          <Select label="Plan" value={edit.plan_id} onChange={(e) => setEdit({ ...edit, plan_id: e.target.value })}>{plans?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select label="Estado de suscripción" value={edit.subscription_status} onChange={(e) => setEdit({ ...edit, subscription_status: e.target.value })}>
            {['trialing', 'active', 'past_due', 'paused', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          <Input label="Fin de prueba" type="datetime-local" value={toLocalInput(edit.trial_ends_at)} onChange={(e) => setEdit({ ...edit, trial_ends_at: fromLocalInput(e.target.value) })} />
          <Input label="Fin del período pago" type="datetime-local" value={toLocalInput(edit.current_period_end)} onChange={(e) => setEdit({ ...edit, current_period_end: fromLocalInput(e.target.value) })} hint="Para cobros manuales o cortesías." />
        </>}
      </Modal>
    </>
  );
}

export function AdminPlans() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => q<Plan[]>(supabase.from('plans').select('*').order('sort_order')), []);
  const [edit, setEdit] = useState<any>(null);
  if (loading) return <Loading />;
  const numOrNull = (v: string) => (v === '' ? null : Number(v));
  return (
    <>
      <PageHeader title="Planes y precios" subtitle="Los cambios de precio aplican a nuevas suscripciones. Las existentes en Mercado Pago conservan su monto." actions={<Button variant="primary" onClick={() => setEdit({ id: '', name: '', description: '', price_ars: 0, features: {}, sort_order: 10, is_public: true, active: true, isNew: true })}>Nuevo plan</Button>} />
      <ErrorBox error={error} onRetry={reload} />
      <div className="grid-3">{data?.map((p) => (
        <div key={p.id} className="card stack-sm">
          <div className="row-between"><strong>{p.name}</strong>{!p.active ? <Badge kind="err">Inactivo</Badge> : !p.is_public ? <Badge>Oculto</Badge> : <Badge kind="ok">Público</Badge>}</div>
          <div className="price">{fmtMoney(p.price_ars)}<small> /mes</small></div>
          <span className="small muted">Sucursales {p.max_branches ?? '∞'} · Equipo {p.max_staff ?? '∞'} · Tarjetas {p.max_programs ?? '∞'} · Clientes {p.max_cards ?? '∞'}</span>
          <Button size="sm" onClick={() => setEdit(p)}>Editar</Button>
        </div>
      ))}</div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.isNew ? 'Nuevo plan' : `Editar ${edit?.name}`} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
        <Button variant="primary" onClick={async () => {
          const { isNew, created_at, updated_at, ...row } = edit; void created_at; void updated_at;
          try { if (isNew) await q(supabase.from('plans').insert(row)); else await q(supabase.from('plans').update(row).eq('id', row.id)); toast.ok('Plan guardado.'); setEdit(null); reload(); }
          catch (e) { toast.err(errorMessage(e)); }
        }}>Guardar</Button></>}>
        {edit && <>
          {edit.isNew && <Input label="Identificador (minúsculas, sin espacios)" value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} />}
          <Input label="Nombre" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <Textarea label="Descripción" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          <div className="form-grid">
            <Input label="Precio mensual (ARS)" type="number" value={edit.price_ars} onChange={(e) => setEdit({ ...edit, price_ars: Number(e.target.value) })} />
            <Input label="Orden" type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} />
            <Input label="Máx. sucursales (vacío = ∞)" type="number" value={edit.max_branches ?? ''} onChange={(e) => setEdit({ ...edit, max_branches: numOrNull(e.target.value) })} />
            <Input label="Máx. equipo" type="number" value={edit.max_staff ?? ''} onChange={(e) => setEdit({ ...edit, max_staff: numOrNull(e.target.value) })} />
            <Input label="Máx. tarjetas activas" type="number" value={edit.max_programs ?? ''} onChange={(e) => setEdit({ ...edit, max_programs: numOrNull(e.target.value) })} />
            <Input label="Máx. clientes" type="number" value={edit.max_cards ?? ''} onChange={(e) => setEdit({ ...edit, max_cards: numOrNull(e.target.value) })} />
          </div>
          {['points', 'milestones', 'promotions', 'export'].map((f) => <Checkbox key={f} label={({ points: 'Puntos', milestones: 'Hitos', promotions: 'Promociones', export: 'Exportación' } as any)[f]} checked={!!edit.features[f]} onChange={(v) => setEdit({ ...edit, features: { ...edit.features, [f]: v } })} />)}
          <Checkbox label="Visible en la web" checked={edit.is_public} onChange={(v) => setEdit({ ...edit, is_public: v })} />
          <Checkbox label="Activo" checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
        </>}
      </Modal>
    </>
  );
}

export function AdminSupport() {
  const toast = useToast();
  const [tab, setTab] = useState<'tickets' | 'contacts'>('tickets');
  const { data: tickets, reload } = useAsync(() => rpc<any[]>('admin_list_tickets', { p_status: null }), []);
  const { data: contacts, reload: reloadC } = useAsync(() => q<any[]>(supabase.from('contact_requests').select('*').order('created_at', { ascending: false }).limit(200)), []);
  const [edit, setEdit] = useState<any>(null);
  return (
    <>
      <PageHeader title="Soporte e incidencias" />
      <div className="mb-2"><Tabs value={tab} onChange={setTab} items={[{ id: 'tickets', label: 'Consultas de comercios' }, { id: 'contacts', label: 'Contactos comerciales' }]} /></div>
      {tab === 'tickets' ? <div className="stack-sm">
        {tickets?.length === 0 && <p className="muted">Sin consultas.</p>}
        {tickets?.map((t) => <div key={t.id} className="card card-tight stack-sm">
          <div className="row-between"><strong>{t.subject}</strong><div className="row"><Badge>{t.category}</Badge><Badge kind={t.priority === 'urgent' || t.priority === 'high' ? 'err' : ''}>{t.priority}</Badge><Badge kind={t.status === 'open' ? 'warn' : 'ok'}>{t.status}</Badge></div></div>
          <span className="small muted">{t.merchant_name ?? 'Sin comercio'} · {t.author_email} · {fmtDateTime(t.created_at)}</span>
          <p className="small mb-0" style={{ whiteSpace: 'pre-wrap' }}>{t.body}</p>
          <div><Button size="sm" onClick={() => setEdit(t)}>Gestionar</Button></div>
        </div>)}
      </div> : <div className="stack-sm">
        {contacts?.map((c) => <div key={c.id} className="card card-tight stack-sm">
          <div className="row-between"><strong>{c.name}{c.business_name ? ` · ${c.business_name}` : ''}</strong><Badge kind={c.status === 'new' ? 'warn' : 'ok'}>{c.status}</Badge></div>
          <span className="small muted"><a href={`mailto:${c.email}`}>{c.email}</a>{c.phone ? ` · ${c.phone}` : ''} · {fmtDateTime(c.created_at)}</span>
          <p className="small mb-0">{c.message}</p>
          {c.status === 'new' && <div><Button size="sm" onClick={async () => { await rpc('admin_update_contact', { p_id: c.id, p_status: 'contacted' }); reloadC(); }}>Marcar como contactado</Button></div>}
        </div>)}
      </div>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.subject} footer={<Button variant="primary" onClick={async () => {
        try { await rpc('admin_update_ticket', { p_ticket: edit.id, p_status: edit.status, p_priority: edit.priority, p_notes: edit.admin_notes }); setEdit(null); reload(); } catch (e) { toast.err(errorMessage(e)); }
      }}>Guardar</Button>}>
        {edit && <>
          <Select label="Estado" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{['open', 'in_progress', 'resolved', 'closed'].map((s) => <option key={s}>{s}</option>)}</Select>
          <Select label="Prioridad" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })}>{['low', 'normal', 'high', 'urgent'].map((s) => <option key={s}>{s}</option>)}</Select>
          <Textarea label="Notas internas" value={edit.admin_notes ?? ''} onChange={(e) => setEdit({ ...edit, admin_notes: e.target.value })} />
        </>}
      </Modal>
    </>
  );
}

export function AdminAudit() {
  return <><PageHeader title="Auditoría global" /><AuditList merchantId={null} /></>;
}

export function AdminSettings() {
  const toast = useToast();
  const { data, reload } = useAsync(() => q<any[]>(supabase.from('platform_settings').select('*').order('key')), []);
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <>
      <PageHeader title="Parámetros del sistema" subtitle="Valores JSON. Ej.: números (14), textos entre comillas (&quot;texto&quot;)." />
      <div className="card stack" style={{ maxWidth: 720 }}>
        {data?.map((s) => (
          <div key={s.key} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
            <div className="grow"><Input label={<span className="mono">{s.key}{s.is_public ? ' (público)' : ''}</span>} className="mono" value={values[s.key] ?? JSON.stringify(s.value)} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} /></div>
            <Button onClick={async () => {
              try { const v = JSON.parse(values[s.key] ?? JSON.stringify(s.value)); await q(supabase.from('platform_settings').update({ value: v }).eq('key', s.key)); toast.ok('Guardado.'); reload(); }
              catch (e) { toast.err(e instanceof SyntaxError ? 'JSON inválido.' : errorMessage(e)); }
            }}>Guardar</Button>
          </div>
        ))}
      </div>
    </>
  );
}
