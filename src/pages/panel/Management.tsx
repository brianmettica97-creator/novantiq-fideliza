import { useEffect, useState } from 'react';
import { Building2, CreditCard, Megaphone, Plus, UserPlus } from 'lucide-react';
import { ImageUpload } from '../../components/ImageUpload';
import { Alert, Badge, Button, Checkbox, ColorInput, ConfirmModal, CopyField, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, Textarea } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useMerchant } from '../../context/MerchantContext';
import { useToast } from '../../context/ToastContext';
import { callFunction, errorMessage, q, rpc } from '../../lib/api';
import { CATEGORIES, PAYMENTS_NOTE, PROGRAM_STATUS } from '../../lib/constants';
import { daysUntil, fmtDate, fmtDateTime, fmtMoney, fromLocalInput, toLocalInput } from '../../lib/format';
import { ALL_PERMISSIONS, PERMISSION_LABEL, ROLE_DESCRIPTION, ROLE_LABEL, roleCan, type Role } from '../../lib/permissions';
import { SITE_URL, supabase } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import type { Branch, Merchant, Plan, Program } from '../../lib/types';

// ---------------------------------------------------------------------------- Equipo
export function TeamPage() {
  const { merchantId, current } = useMerchant();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => rpc<any>('get_team', { p_merchant: merchantId }), [merchantId]);
  const { data: branches } = useAsync(() => q<Branch[]>(supabase.from('branches').select('*').eq('merchant_id', merchantId!).eq('active', true).order('name')), [merchantId]);
  const [invite, setInvite] = useState<{ email: string; name: string; role: Role; all: boolean; ids: string[] } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [remove, setRemove] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = current?.role === 'owner';
  const assignable: Role[] = isOwner ? ['admin', 'manager', 'staff'] : ['manager', 'staff'];

  if (loading && !data) return <Loading />;
  return (
    <>
      <PageHeader title="Equipo" subtitle={data && `${data.slots_used} de ${data.slots_max ?? '∞'} lugares usados (sin contar al titular)`}
        actions={<Button variant="primary" icon={<UserPlus size={16} />} onClick={() => { setLink(null); setInvite({ email: '', name: '', role: 'staff', all: true, ids: [] }); }}>Invitar</Button>} />
      <ErrorBox error={error} onRetry={reload} />
      {data && <div className="stack">
        <div className="table-wrap"><table className="table table-stack">
          <thead><tr><th>Persona</th><th>Rol</th><th>Sucursales</th><th>Estado</th><th /></tr></thead>
          <tbody>{data.members.map((m: any) => (
            <tr key={m.membership_id}>
              <td data-label="Persona"><strong>{m.name ?? m.email}</strong>{m.is_me && <> <Badge kind="lime">Vos</Badge></>}<div className="small subtle">{m.email}</div></td>
              <td data-label="Rol">{ROLE_LABEL[m.role as Role]}</td>
              <td data-label="Sucursales" className="small">{m.all_branches || ['owner', 'admin'].includes(m.role) ? 'Todas' : m.branch_ids.map((id: string) => branches?.find((b) => b.id === id)?.name).filter(Boolean).join(', ')}</td>
              <td data-label="Estado">{m.status === 'active' ? <Badge kind="ok">Activo</Badge> : <Badge kind="err">Deshabilitado</Badge>}</td>
              <td>{!m.is_me && m.role !== 'owner' && (isOwner || m.role !== 'admin') && <div className="row">
                <Button size="sm" onClick={() => setEdit({ ...m })}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => setRemove(m)}>Quitar</Button></div>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {data.invitations.length > 0 && <div className="card stack-sm">
          <h3>Invitaciones pendientes</h3>
          {data.invitations.map((i: any) => (
            <div key={i.id} className="row-between small">
              <span><strong>{i.full_name || i.email}</strong> · {ROLE_LABEL[i.role as Role]} · {i.expired ? <Badge kind="err">Vencida</Badge> : `vence ${fmtDate(i.expires_at)}`}</span>
              <Button size="sm" variant="ghost" onClick={async () => { await rpc('revoke_invitation', { p_invitation: i.id }); reload(); }}>Revocar</Button>
            </div>
          ))}
        </div>}
        <details className="faq"><summary>¿Qué puede hacer cada rol?</summary>
          <div className="table-wrap mt-2"><table className="table">
            <thead><tr><th>Permiso</th>{(['owner', 'admin', 'manager', 'staff'] as Role[]).map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>{ALL_PERMISSIONS.map((p) => <tr key={p}><td>{PERMISSION_LABEL[p]}</td>{(['owner', 'admin', 'manager', 'staff'] as Role[]).map((r) => <td key={r}>{roleCan(r, p) ? '✓' : '—'}</td>)}</tr>)}</tbody>
          </table></div>
        </details>
      </div>}

      <Modal open={!!invite} onClose={() => setInvite(null)} title="Invitar al equipo" footer={!link && <><Button variant="ghost" onClick={() => setInvite(null)}>Cancelar</Button>
        <Button variant="primary" loading={busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await rpc<{ token: string }>('invite_member', { p_merchant: merchantId, p_email: invite!.email, p_role: invite!.role, p_full_name: invite!.name, p_all_branches: invite!.all, p_branch_ids: invite!.ids });
            setLink(`${SITE_URL}/invitacion/${r.token}`);
            reload();
          } catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
        }}>Crear invitación</Button></>}>
        {invite && (link ? (
          <div className="stack">
            <Alert kind="ok">Invitación creada. Enviale este enlace a <strong>{invite.email}</strong>. Vence en 7 días y solo funciona con ese correo.</Alert>
            <CopyField value={link} />
            <a className="btn btn-primary" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Te invito a sumarte al equipo de ${current?.name} en NOVANTIQ Fideliza: ${link}`)}`}>Enviar por WhatsApp</a>
            <a className="btn" href={`mailto:${invite.email}?subject=${encodeURIComponent(`Invitación a ${current?.name}`)}&body=${encodeURIComponent(`Hola! Te invito a sumarte al equipo de ${current?.name} en NOVANTIQ Fideliza: ${link}`)}`}>Enviar por correo</a>
          </div>
        ) : <>
          <Input label="Nombre" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} maxLength={120} />
          <Input label="Correo electrónico" type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <Select label="Rol" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })} hint={ROLE_DESCRIPTION[invite.role]}>
            {assignable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
          {invite.role !== 'admin' && <BranchScope all={invite.all} ids={invite.ids} branches={branches ?? []} onChange={(all, ids) => setInvite({ ...invite, all, ids })} />}
        </>)}
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Editar a ${edit?.name ?? edit?.email}`} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
        <Button variant="primary" loading={busy} onClick={async () => {
          setBusy(true);
          try { await rpc('update_member', { p_membership: edit.membership_id, p_role: edit.role, p_status: edit.status, p_all_branches: edit.role === 'admin' ? true : edit.all_branches, p_branch_ids: edit.branch_ids }); toast.ok('Cambios guardados.'); setEdit(null); reload(); }
          catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
        }}>Guardar</Button></>}>
        {edit && <>
          <Select label="Rol" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{assignable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
          {edit.role !== 'admin' && <BranchScope all={edit.all_branches} ids={edit.branch_ids} branches={branches ?? []} onChange={(all, ids) => setEdit({ ...edit, all_branches: all, branch_ids: ids })} />}
          <Checkbox label="Acceso habilitado" checked={edit.status === 'active'} onChange={(v) => setEdit({ ...edit, status: v ? 'active' : 'disabled' })} />
        </>}
      </Modal>
      <ConfirmModal open={!!remove} danger title="Quitar del equipo" confirmLabel="Quitar" onClose={() => setRemove(null)}
        body={<p>{remove?.name ?? remove?.email} perderá el acceso de inmediato. Sus operaciones registradas se conservan.</p>}
        onConfirm={async () => { try { await rpc('remove_member', { p_membership: remove.membership_id }); setRemove(null); reload(); } catch (e) { toast.err(errorMessage(e)); } }} />
    </>
  );
}

function BranchScope({ all, ids, branches, onChange }: { all: boolean; ids: string[]; branches: Branch[]; onChange: (all: boolean, ids: string[]) => void }) {
  if (branches.length <= 1) return null;
  return (
    <div className="stack-sm">
      <Checkbox label="Puede operar en todas las sucursales" checked={all} onChange={(v) => onChange(v, ids)} />
      {!all && branches.map((b) => <Checkbox key={b.id} label={b.name} checked={ids.includes(b.id)} onChange={(v) => onChange(all, v ? [...ids, b.id] : ids.filter((x) => x !== b.id))} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------- Sucursales
export function BranchesPage() {
  const { merchantId } = useMerchant();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => q<Branch[]>(supabase.from('branches').select('*').eq('merchant_id', merchantId!).order('name')), [merchantId]);
  const [edit, setEdit] = useState<Partial<Branch> | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Loading />;
  return (
    <>
      <PageHeader title="Sucursales" actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit({ name: '', active: true })}>Nueva sucursal</Button>} />
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 ? <Empty icon={<Building2 />} title="Sin sucursales" /> : <div className="grid-3">
        {data?.map((b) => (
          <div key={b.id} className="card stack-sm">
            <div className="row-between"><strong>{b.name}</strong>{b.active ? <Badge kind="ok">Activa</Badge> : <Badge>Inactiva</Badge>}</div>
            <span className="small muted">{b.address || 'Sin dirección'}{b.phone ? ` · ${b.phone}` : ''}</span>
            <div className="row"><Button size="sm" onClick={() => setEdit(b)}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={async () => { try { await q(supabase.from('branches').update({ active: !b.active }).eq('id', b.id)); reload(); } catch (e) { toast.err(errorMessage(e)); } }}>{b.active ? 'Desactivar' : 'Activar'}</Button></div>
          </div>
        ))}
      </div>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar sucursal' : 'Nueva sucursal'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
        <Button variant="primary" loading={busy} onClick={async () => {
          setBusy(true);
          try {
            const row = { name: edit!.name?.trim(), address: edit!.address || null, phone: edit!.phone || null };
            if (edit!.id) await q(supabase.from('branches').update(row).eq('id', edit!.id));
            else await q(supabase.from('branches').insert({ ...row, merchant_id: merchantId }));
            toast.ok('Sucursal guardada.'); setEdit(null); reload();
          } catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
        }}>Guardar</Button></>}>
        {edit && <>
          <Input label="Nombre" maxLength={60} value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <Input label="Dirección" maxLength={200} value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
          <Input label="Teléfono" maxLength={40} value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
        </>}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------- Promociones
export function PromotionsPage() {
  const { merchantId, hasFeature } = useMerchant();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => ({
    promos: await q<any[]>(supabase.from('promotions').select('*').eq('merchant_id', merchantId!).neq('status', 'archived').order('created_at', { ascending: false })),
    programs: await q<Pick<Program, 'id' | 'name'>[]>(supabase.from('programs').select('id, name').eq('merchant_id', merchantId!).neq('status', 'archived')),
  }), [merchantId]);
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  if (!hasFeature('promotions')) return <><PageHeader title="Promociones" /><Empty icon={<Megaphone />} title="Disponible en el plan Profesional">Publicá promociones por tiempo limitado que tus clientes ven en su tarjeta.</Empty></>;
  if (loading && !data) return <Loading />;
  return (
    <>
      <PageHeader title="Promociones" subtitle="Se muestran en la tarjeta del cliente y en la página de inscripción." actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit({ title: '', description: '', terms: '', status: 'active', program_id: null })}>Nueva promoción</Button>} />
      <ErrorBox error={error} onRetry={reload} />
      {data?.promos.length === 0 ? <Empty icon={<Megaphone />} title="Sin promociones">Ej.: “Doble sello los martes” o “10% off presentando tu tarjeta”.</Empty> : <div className="grid-2">
        {data?.promos.map((p) => (
          <div key={p.id} className="card stack-sm">
            <div className="row-between"><strong>{p.title}</strong><Badge kind={PROGRAM_STATUS[p.status].badge.replace('badge-', '') as any}>{PROGRAM_STATUS[p.status].label}</Badge></div>
            <span className="small muted">{p.description}</span>
            <span className="small subtle">{p.starts_at ? `Desde ${fmtDate(p.starts_at)} ` : ''}{p.ends_at ? `hasta ${fmtDate(p.ends_at)}` : 'Sin vencimiento'}</span>
            <div className="row"><Button size="sm" onClick={() => setEdit(p)}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={async () => { await q(supabase.from('promotions').update({ status: 'archived' }).eq('id', p.id)); reload(); }}>Archivar</Button></div>
          </div>
        ))}
      </div>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar promoción' : 'Nueva promoción'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
        <Button variant="primary" loading={busy} onClick={async () => {
          setBusy(true);
          try {
            const row = { title: edit.title.trim(), description: edit.description, terms: edit.terms, status: edit.status, program_id: edit.program_id || null, starts_at: edit.starts_at || null, ends_at: edit.ends_at || null };
            if (edit.id) await q(supabase.from('promotions').update(row).eq('id', edit.id)); else await q(supabase.from('promotions').insert({ ...row, merchant_id: merchantId }));
            toast.ok('Promoción guardada.'); setEdit(null); reload();
          } catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
        }}>Guardar</Button></>}>
        {edit && <>
          <Input label="Título" maxLength={80} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <Textarea label="Descripción" maxLength={500} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          <Textarea label="Condiciones" maxLength={1000} value={edit.terms} onChange={(e) => setEdit({ ...edit, terms: e.target.value })} />
          <Select label="Tarjeta" value={edit.program_id ?? ''} onChange={(e) => setEdit({ ...edit, program_id: e.target.value || null })}><option value="">Todas</option>{data?.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <div className="form-grid">
            <Input label="Desde" type="datetime-local" value={toLocalInput(edit.starts_at)} onChange={(e) => setEdit({ ...edit, starts_at: fromLocalInput(e.target.value) })} />
            <Input label="Hasta" type="datetime-local" value={toLocalInput(edit.ends_at)} onChange={(e) => setEdit({ ...edit, ends_at: fromLocalInput(e.target.value) })} />
          </div>
          <Select label="Estado" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Activa</option><option value="paused">Pausada</option><option value="draft">Borrador</option></Select>
          <p className="small subtle mb-0">Las promociones son informativas: no suman ni descuentan saldo automáticamente.</p>
        </>}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------- Configuración
export function SettingsPage() {
  const { merchantId, refresh } = useMerchant();
  const toast = useToast();
  const [m, setM] = useState<Merchant | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { q<Merchant>(supabase.from('merchants').select('*').eq('id', merchantId!).single()).then(setM).catch((e) => toast.err(errorMessage(e))); }, [merchantId]); // eslint-disable-line
  if (!m) return <Loading />;
  const set = (k: keyof Merchant, v: any) => setM({ ...m, [k]: v });
  return (
    <>
      <PageHeader title="Configuración del comercio" subtitle={`Identificador público: ${m.slug}`} />
      <form className="card stack" style={{ maxWidth: 760 }} onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try {
          const { name, category, description, logo_url, brand_color, brand_text_color, contact_email, phone, website, instagram, address, city, province } = m;
          await q(supabase.from('merchants').update({ name, category, description, logo_url, brand_color, brand_text_color, contact_email: contact_email || null, phone: phone || null, website: website || null, instagram: instagram || null, address: address || null, city: city || null, province: province || null }).eq('id', m.id));
          await refresh(); toast.ok('Datos guardados.');
        } catch (err) { toast.err(errorMessage(err)); } finally { setBusy(false); }
      }}>
        <div className="form-grid">
          <Input label="Nombre" maxLength={80} value={m.name} onChange={(e) => set('name', e.target.value)} />
          <Select label="Rubro" value={m.category} onChange={(e) => set('category', e.target.value)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
        </div>
        <Textarea label="Descripción" maxLength={500} value={m.description} onChange={(e) => set('description', e.target.value)} />
        <ImageUpload merchantId={m.id} folder="logo" value={m.logo_url} onChange={(v) => set('logo_url', v)} />
        <div className="form-grid">
          <ColorInput label="Color de marca" value={m.brand_color} onChange={(v) => set('brand_color', v)} />
          <Input label="Correo de contacto" type="email" value={m.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value)} />
          <Input label="Teléfono" value={m.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          <Input label="Sitio web" value={m.website ?? ''} onChange={(e) => set('website', e.target.value)} />
          <Input label="Instagram" value={m.instagram ?? ''} onChange={(e) => set('instagram', e.target.value)} placeholder="@tucomercio" />
          <Input label="Dirección" value={m.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          <Input label="Ciudad" value={m.city ?? ''} onChange={(e) => set('city', e.target.value)} />
          <Input label="Provincia" value={m.province ?? ''} onChange={(e) => set('province', e.target.value)} />
        </div>
        <div className="row"><Button variant="primary" type="submit" loading={busy}>Guardar</Button></div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------- Suscripción
export function BillingPage() {
  const { merchantId, current, refresh } = useMerchant();
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => ({
    sub: await q<any>(supabase.from('subscriptions').select('*').eq('merchant_id', merchantId!).single()),
    plans: await q<Plan[]>(supabase.from('plans').select('*').eq('active', true).eq('is_public', true).order('sort_order')),
  }), [merchantId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancel, setCancel] = useState(false);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} onRetry={reload} />;
  const { sub, plans } = data;
  const STATUS: Record<string, [string, any]> = { trialing: ['Prueba gratuita', 'lime'], active: ['Activa', 'ok'], past_due: ['Pago pendiente', 'warn'], paused: ['Pausada', 'warn'], cancelled: ['Cancelada', 'err'] };
  const trialDays = daysUntil(sub.trial_ends_at);

  async function checkout(planId: string) {
    setBusy(planId);
    try {
      const r = await callFunction<{ init_point: string }>('billing-checkout', { merchant_id: merchantId, plan_id: planId, payer_email: user?.email });
      window.location.href = r.init_point;
    } catch (e) { toast.err(errorMessage(e)); setBusy(null); }
  }

  return (
    <>
      <PageHeader title="Suscripción" />
      <div className="card stack-sm mb-2">
        <div className="row-between"><h3 className="mb-0">Plan {plans.find((p) => p.id === sub.plan_id)?.name ?? sub.plan_id}</h3><Badge kind={STATUS[sub.status]?.[1]}>{STATUS[sub.status]?.[0] ?? sub.status}</Badge></div>
        {sub.status === 'trialing' && <span className="muted">{trialDays != null && trialDays > 0 ? `Tu prueba termina el ${fmtDate(sub.trial_ends_at)} (${trialDays} días).` : 'Tu prueba terminó.'} Elegí un plan para seguir operando.</span>}
        {sub.current_period_end && <span className="muted">Próximo vencimiento: {fmtDate(sub.current_period_end)}</span>}
        {sub.last_payment_at && <span className="small subtle">Último pago: {fmtDateTime(sub.last_payment_at)}</span>}
        {sub.status === 'active' && sub.provider === 'mercadopago' && <div><Button size="sm" variant="ghost" onClick={() => setCancel(true)}>Cancelar suscripción</Button></div>}
      </div>
      {current?.operational_status !== 'ok' && <div className="mb-2"><Alert kind="err">Las operaciones están pausadas hasta regularizar la suscripción.</Alert></div>}
      <div className="grid-3">
        {plans.map((p) => (
          <div key={p.id} className={`card stack ${p.id === sub.plan_id ? 'card-accent' : ''}`}>
            <div><h3 className="mb-0">{p.name}</h3><span className="small muted">{p.description}</span></div>
            <div className="price">{fmtMoney(p.price_ars)}<small> /mes</small></div>
            <PlanFeatures plan={p} />
            <Button variant={p.id === sub.plan_id ? 'secondary' : 'primary'} icon={<CreditCard size={16} />} loading={busy === p.id}
              disabled={sub.status === 'active' && p.id === sub.plan_id} onClick={() => checkout(p.id)}>
              {sub.status === 'active' && p.id === sub.plan_id ? 'Plan actual' : sub.status === 'active' ? 'Cambiar a este plan' : 'Contratar'}</Button>
          </div>
        ))}
      </div>
      <p className="small subtle mt-2">{PAYMENTS_NOTE} Precios finales en pesos argentinos. Débito automático mensual; podés cancelar cuando quieras.</p>
      <ConfirmModal open={cancel} danger title="Cancelar suscripción" confirmLabel="Cancelar suscripción" onClose={() => setCancel(false)}
        body={<p>Se detendrán los cobros. El servicio sigue activo hasta el {fmtDate(sub.current_period_end)}. Tus datos se conservan.</p>}
        onConfirm={async () => { try { await callFunction('billing-cancel', { merchant_id: merchantId }); toast.ok('Suscripción cancelada.'); setCancel(false); reload(); refresh(); } catch (e) { toast.err(errorMessage(e)); } }} />
    </>
  );
}

export function PlanFeatures({ plan }: { plan: Plan }) {
  const lim = (v: number | null, one: string, many: string) => (v == null ? `${many} ilimitados` : `${v} ${v === 1 ? one : many}`);
  const items = [
    lim(plan.max_branches, 'sucursal', 'sucursales').replace('ilimitados', 'ilimitadas'),
    `${lim(plan.max_staff, 'integrante', 'integrantes')} de equipo`,
    `${lim(plan.max_programs, 'tarjeta activa', 'tarjetas activas').replace('ilimitados', 'ilimitadas')}`,
    lim(plan.max_cards, 'cliente', 'clientes'),
    'Sellos y visitas, QR antifraude, estadísticas',
    ...(plan.features.points ? ['Programas de puntos'] : []),
    ...(plan.features.milestones ? ['Recompensas por hitos'] : []),
    ...(plan.features.promotions ? ['Promociones'] : []),
    ...(plan.features.export ? ['Exportación de clientes'] : []),
  ];
  return <ul className="check-list">{items.map((i) => <li key={i}><span className="lime">✓</span>{i}</li>)}</ul>;
}

// ---------------------------------------------------------------------------- Auditoría
const AUDIT_LABEL: Record<string, string> = { insert: 'Creación', update: 'Modificación', delete: 'Eliminación', operation_rejected: 'Operación rechazada', transaction_reversed: 'Anulación', balance_adjusted: 'Ajuste de saldo', card_status_changed: 'Estado de tarjeta', merchant_created: 'Alta de comercio' };
const ENTITY_LABEL: Record<string, string> = { programs: 'Tarjeta', rewards: 'Recompensa', branches: 'Sucursal', memberships: 'Equipo', invitations: 'Invitación', merchants: 'Comercio', subscriptions: 'Suscripción', promotions: 'Promoción', cards: 'Tarjeta de cliente', card_transactions: 'Movimiento' };

export function AuditList({ merchantId }: { merchantId: string | null }) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAsync(() => rpc<any>('list_audit', { p_merchant: merchantId, p_action: filter || null, p_limit: 50, p_offset: page * 50 }), [merchantId, filter, page]);
  return (
    <div className="stack">
      <Select label="Filtrar" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}>
        <option value="">Todo</option><option value="operation_rejected">Operaciones rechazadas</option><option value="transaction_reversed">Anulaciones</option>
        <option value="balance_adjusted">Ajustes</option><option value="memberships">Cambios de equipo</option><option value="programs">Cambios en tarjetas</option>
      </Select>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && <div className="table-wrap"><table className="table table-stack">
        <thead><tr><th>Fecha</th>{!merchantId && <th>Comercio</th>}<th>Acción</th><th>Quién</th><th>Detalle</th></tr></thead>
        <tbody>{data.rows.map((r: any) => (
          <tr key={r.id}>
            <td data-label="Fecha" className="nowrap">{fmtDateTime(r.created_at)}</td>
            {!merchantId && <td data-label="Comercio">{r.merchant_name ?? '—'}</td>}
            <td data-label="Acción">{AUDIT_LABEL[r.action] ?? r.action} · <span className="subtle">{ENTITY_LABEL[r.entity] ?? r.entity}</span></td>
            <td data-label="Quién">{r.actor_name ?? 'Sistema'}</td>
            <td data-label="Detalle"><details><summary className="small">Ver</summary><pre className="small muted" style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{JSON.stringify(r.details, null, 1)}</pre></details></td>
          </tr>
        ))}</tbody>
      </table></div>}
      {data && data.total > 50 && <div className="row" style={{ justifyContent: 'center' }}><Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button><Button size="sm" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</Button></div>}
    </div>
  );
}

export function AuditPage() {
  const { merchantId } = useMerchant();
  return <><PageHeader title="Auditoría" subtitle="Registro de cambios de configuración, correcciones e intentos rechazados." /><AuditList merchantId={merchantId} /></>;
}

// ---------------------------------------------------------------------------- Soporte
export function SupportPage() {
  const { merchantId } = useMerchant();
  const { user } = useAuth();
  const toast = useToast();
  const { data, reload } = useAsync(() => q<any[]>(supabase.from('support_tickets').select('*').eq('created_by', user!.id).order('created_at', { ascending: false })), [user?.id]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader title="Soporte" subtitle="Escribinos y te respondemos por correo." />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <form className="card stack" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          try { await rpc('create_support_ticket', { p_merchant: merchantId, p_subject: subject, p_body: body, p_category: category }); toast.ok('Consulta enviada.'); setSubject(''); setBody(''); reload(); }
          catch (err) { toast.err(errorMessage(err)); } finally { setBusy(false); }
        }}>
          <Select label="Tema" value={category} onChange={(e) => setCategory(e.target.value)}><option value="general">Consulta general</option><option value="tecnico">Problema técnico</option><option value="facturacion">Facturación</option><option value="abuso">Reportar un abuso</option><option value="datos">Datos personales</option></Select>
          <Input label="Asunto" required minLength={3} maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea label="Mensaje" required minLength={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
          <Button variant="primary" type="submit" loading={busy}>Enviar</Button>
        </form>
        <div className="stack-sm">
          <h3>Tus consultas</h3>
          {data?.length === 0 && <p className="muted">Todavía no enviaste consultas.</p>}
          {data?.map((t) => <div key={t.id} className="card card-tight"><div className="row-between"><strong>{t.subject}</strong><Badge kind={t.status === 'resolved' || t.status === 'closed' ? 'ok' : 'warn'}>{({ open: 'Abierta', in_progress: 'En curso', resolved: 'Resuelta', closed: 'Cerrada' } as any)[t.status]}</Badge></div><span className="small subtle">{fmtDateTime(t.created_at)}</span></div>)}
        </div>
      </div>
    </>
  );
}
