import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, Copy, Gift, Pause, Play, Plus, Rocket, Trash2 } from 'lucide-react';
import { LoyaltyCard, STAMP_ICON_MAP } from '../../components/LoyaltyCard';
import { CARD_THEMES, CLASSIC_THEME, ThemedCard } from '../../components/ThemedCard';
import { ImageUpload } from '../../components/ImageUpload';
import { Alert, Badge, Button, Checkbox, ColorInput, ConfirmModal, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, Tabs, Textarea } from '../../components/ui';
import { useMerchant } from '../../context/MerchantContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage, q, rpc } from '../../lib/api';
import { CARD_PALETTES, PROGRAM_STATUS, PROGRAM_TYPES, STAMP_ICONS, programType } from '../../lib/constants';
import { fmtDate, fmtDateTime, fromLocalInput, toLocalInput } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import type { Branch, Program, ProgramType, Reward } from '../../lib/types';

export type ProgramDraft = Pick<Program, 'type' | 'name' | 'description' | 'stamps_required' | 'max_units_per_tx' | 'earn_points' | 'earn_amount'
  | 'max_points_per_tx' | 'max_amount_per_tx' | 'daily_limit_per_card' | 'min_minutes_between' | 'welcome_bonus' | 'terms' | 'bg_color'
  | 'text_color' | 'accent_color' | 'logo_url' | 'stamp_icon' | 'theme' | 'starts_at' | 'ends_at' | 'all_branches' | 'join_enabled'>;

export const EDITABLE_FIELDS: (keyof ProgramDraft)[] = ['name', 'description', 'stamps_required', 'max_units_per_tx', 'earn_points', 'earn_amount',
  'max_points_per_tx', 'max_amount_per_tx', 'daily_limit_per_card', 'min_minutes_between', 'welcome_bonus', 'terms', 'bg_color', 'text_color',
  'accent_color', 'logo_url', 'stamp_icon', 'theme', 'starts_at', 'ends_at', 'all_branches', 'join_enabled'];

export function defaultDraft(type: ProgramType = 'stamps'): ProgramDraft {
  return {
    type, name: '', description: '', stamps_required: type === 'stamps' || type === 'visits' ? 8 : null, max_units_per_tx: 1,
    earn_points: type === 'points' ? 1 : null, earn_amount: type === 'points' ? 1000 : null, max_points_per_tx: type === 'points' ? 500 : null,
    max_amount_per_tx: null, daily_limit_per_card: type === 'visits' ? 1 : 3, min_minutes_between: 0, welcome_bonus: 0, terms: '',
    bg_color: '#17191D', text_color: '#FFFFFF', accent_color: '#B7F000', logo_url: null, stamp_icon: 'star', theme: 'classic', starts_at: null, ends_at: null,
    all_branches: true, join_enabled: true,
  };
}

export function validateDraft(d: ProgramDraft): string | null {
  if (d.name.trim().length < 2) return 'Poné un nombre a la tarjeta.';
  if ((d.type === 'stamps' || d.type === 'visits') && (!d.stamps_required || d.stamps_required < 2 || d.stamps_required > 50)) return 'La cantidad de sellos debe estar entre 2 y 50.';
  if (d.type === 'stamps' && d.max_units_per_tx > (d.stamps_required ?? 0)) return 'El máximo por operación no puede superar los sellos necesarios.';
  if (d.type === 'points' && (!d.earn_points || !d.earn_amount)) return 'Definí la regla de puntos.';
  if (d.ends_at && d.starts_at && d.ends_at <= d.starts_at) return 'La fecha de fin debe ser posterior al inicio.';
  return null;
}

const num = (v: string) => (v === '' ? null : Number(v));

/** Formulario de reglas y diseño de una tarjeta. */
export function ProgramForm({ draft, onChange, merchantId, merchantName, rewardName, section = 'all' }: {
  draft: ProgramDraft; onChange: (d: ProgramDraft) => void; merchantId: string; merchantName: string; rewardName?: string; section?: 'rules' | 'design' | 'all';
}) {
  const set = <K extends keyof ProgramDraft>(k: K, v: ProgramDraft[K]) => onChange({ ...draft, [k]: v });
  const t = programType(draft.type);
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="stack">
        {section !== 'design' && <>
          <Input label="Nombre de la tarjeta" required maxLength={60} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej.: Café Frecuente" />
          <Textarea label="Descripción (opcional)" maxLength={300} value={draft.description} onChange={(e) => set('description', e.target.value)} />
          {(draft.type === 'stamps' || draft.type === 'visits') && (
            <div className="form-grid">
              <Input label={`${t.units[0].toUpperCase()}${t.units.slice(1)} para completar`} type="number" min={2} max={50} value={draft.stamps_required ?? ''} onChange={(e) => set('stamps_required', num(e.target.value))} />
              {draft.type === 'stamps' && <Input label="Máx. sellos por compra" type="number" min={1} max={20} value={draft.max_units_per_tx} onChange={(e) => set('max_units_per_tx', Number(e.target.value) || 1)} hint="Ej.: 2 si compra dos cafés." />}
            </div>
          )}
          {draft.type === 'points' && (
            <div className="form-grid">
              <Input label="Puntos" type="number" min={1} value={draft.earn_points ?? ''} onChange={(e) => set('earn_points', num(e.target.value))} />
              <Input label="Por cada ($)" type="number" min={1} value={draft.earn_amount ?? ''} onChange={(e) => set('earn_amount', num(e.target.value))} />
              <Input label="Tope de puntos por compra" type="number" min={1} value={draft.max_points_per_tx ?? ''} onChange={(e) => set('max_points_per_tx', num(e.target.value))} />
              <Input label="Importe máximo por compra ($)" type="number" min={1} value={draft.max_amount_per_tx ?? ''} onChange={(e) => set('max_amount_per_tx', num(e.target.value))} hint="Opcional, evita errores de carga." />
            </div>
          )}
          <div className="form-grid">
            <Input label="Máx. operaciones por día y tarjeta" type="number" min={1} max={50} value={draft.daily_limit_per_card} onChange={(e) => set('daily_limit_per_card', Number(e.target.value) || 1)} />
            <Input label="Minutos mínimos entre operaciones" type="number" min={0} max={1440} value={draft.min_minutes_between} onChange={(e) => set('min_minutes_between', Number(e.target.value) || 0)} hint="0 = sin restricción." />
            <Input label={`Bienvenida (${t.units})`} type="number" min={0} max={1000} value={draft.welcome_bonus} onChange={(e) => set('welcome_bonus', Number(e.target.value) || 0)} hint="Se otorga una sola vez al sumarse." />
          </div>
          <div className="form-grid">
            <Input label="Comienza (opcional)" type="datetime-local" value={toLocalInput(draft.starts_at)} onChange={(e) => set('starts_at', fromLocalInput(e.target.value))} />
            <Input label="Finaliza (opcional)" type="datetime-local" value={toLocalInput(draft.ends_at)} onChange={(e) => set('ends_at', fromLocalInput(e.target.value))} />
          </div>
          <Textarea label="Condiciones" maxLength={2000} value={draft.terms} onChange={(e) => set('terms', e.target.value)} placeholder="Ej.: Válido para cafés medianos. No acumulable con otras promociones. Un sello por compra." />
          <Checkbox label="Permitir nuevas inscripciones" checked={draft.join_enabled} onChange={(v) => set('join_enabled', v)} />
        </>}
        {section !== 'rules' && <>
          <ThemePicker draft={draft} merchantName={merchantName} onPick={(theme) => set('theme', theme)} />
          {draft.theme !== 'classic' && <p className="small subtle mb-0">Los diseños por rubro tienen su propia paleta y animaciones. Tu nombre, logo y premio se muestran igual. Para usar tus colores, elegí “Clásico”.</p>}
          {draft.theme === 'classic' && <>
          <div className="field"><span className="label">Paletas sugeridas</span>
            <div className="row">{CARD_PALETTES.map((p) => (
              <button key={p.name} type="button" title={p.name} aria-label={`Paleta ${p.name}`} onClick={() => onChange({ ...draft, bg_color: p.bg, text_color: p.text, accent_color: p.accent })}
                style={{ width: 36, height: 36, borderRadius: 10, border: '2px solid var(--line-strong)', background: `linear-gradient(135deg, ${p.bg} 60%, ${p.accent} 60%)`, cursor: 'pointer' }} />
            ))}</div>
          </div>
          <div className="form-grid">
            <ColorInput label="Fondo" value={draft.bg_color} onChange={(v) => set('bg_color', v)} />
            <ColorInput label="Texto" value={draft.text_color} onChange={(v) => set('text_color', v)} />
            <ColorInput label="Acento" value={draft.accent_color} onChange={(v) => set('accent_color', v)} />
          </div>
          {(draft.type === 'stamps' || draft.type === 'visits') && (
            <div className="field"><span className="label">Ícono del sello</span>
              <div className="row">{STAMP_ICONS.map((i) => { const I = STAMP_ICON_MAP[i]; return (
                <button key={i} type="button" className="btn btn-icon" aria-pressed={draft.stamp_icon === i} aria-label={i} onClick={() => set('stamp_icon', i)}
                  style={draft.stamp_icon === i ? { borderColor: 'var(--lime)', color: 'var(--lime)' } : undefined}><I size={18} /></button>); })}</div>
            </div>
          )}
          </>}
          <ImageUpload merchantId={merchantId} folder="programs" label="Logo de la tarjeta (opcional, usa el del comercio si no subís uno)" value={draft.logo_url} onChange={(v) => set('logo_url', v)} />
        </>}
      </div>
      <div className="stack" style={{ position: 'sticky', top: 80 }}>
        <span className="label">Vista previa</span>
        <LoyaltyCard look={{ theme: draft.theme, type: draft.type, name: draft.name || 'Nombre de la tarjeta', merchantName, logoUrl: draft.logo_url, bgColor: draft.bg_color, textColor: draft.text_color, accentColor: draft.accent_color, stampIcon: draft.stamp_icon, stampsRequired: draft.stamps_required, balance: Math.min(3, (draft.stamps_required ?? 10) - 1), rewardName, code: 'ABCD1234' }} />
      </div>
    </div>
  );
}

export function ProgramsPage() {
  const { merchantId, hasFeature } = useMerchant();
  const { data, error, loading, reload } = useAsync(() => q<Program[]>(supabase.from('programs').select('*').eq('merchant_id', merchantId!).order('created_at', { ascending: false })), [merchantId]);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  if (loading) return <Loading />;
  const list = (data ?? []).filter((p) => showArchived || p.status !== 'archived');
  return (
    <>
      <PageHeader title="Tarjetas y recompensas" subtitle="Creá, editá, pausá o duplicá tus programas de fidelización." actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>Nueva tarjeta</Button>} />
      <ErrorBox error={error} onRetry={reload} />
      {list.length === 0 ? <Empty icon={<Gift />} title="Todavía no creaste tarjetas" action={<Button variant="primary" onClick={() => setCreating(true)}>Crear mi primera tarjeta</Button>}>Elegí un tipo de programa, definí la recompensa y publicala en minutos.</Empty> : (
        <div className="grid-3">
          {list.map((p) => (
            <Link key={p.id} to={`/panel/tarjetas/${p.id}`} className="card card-hover stack-sm" style={{ color: 'inherit', textDecoration: 'none' }}>
              <div className="row-between"><Badge kind={PROGRAM_STATUS[p.status].badge.replace('badge-', '') as any}>{PROGRAM_STATUS[p.status].label}</Badge><span className="small subtle">{programType(p.type).label}</span></div>
              <LoyaltyCard compact look={{ theme: p.theme, type: p.type, name: p.name, merchantName: '', logoUrl: p.logo_url, bgColor: p.bg_color, textColor: p.text_color, accentColor: p.accent_color, stampIcon: p.stamp_icon, stampsRequired: p.stamps_required, balance: 0 }} />
              <span className="small muted">Creada {fmtDate(p.created_at)} · versión {p.version}</span>
            </Link>
          ))}
        </div>
      )}
      {(data ?? []).some((p) => p.status === 'archived') && <div className="mt-2"><Checkbox label="Mostrar archivadas" checked={showArchived} onChange={setShowArchived} /></div>}
      <Modal open={creating} onClose={() => setCreating(false)} title="¿Qué tipo de tarjeta?">
        {PROGRAM_TYPES.map((pt) => {
          const locked = pt.feature && !hasFeature(pt.feature);
          return (
            <button key={pt.id} className="choice" disabled={!!locked} onClick={async () => {
              const d = defaultDraft(pt.id);
              const [row] = await q<Program[]>(supabase.from('programs').insert({ ...d, merchant_id: merchantId, name: `Nueva ${pt.label.toLowerCase()}` }).select());
              nav(`/panel/tarjetas/${row.id}`);
            }}>
              <div className="grow"><strong>{pt.label}</strong> {locked && <Badge kind="warn">Plan Profesional</Badge>}<div className="small muted">{pt.description}</div></div>
            </button>
          );
        })}
      </Modal>
    </>
  );
}

export function ProgramEditorPage() {
  const { id = '' } = useParams();
  const { merchantId, current } = useMerchant();
  const toast = useToast();
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(async () => {
    const [program, rewards, branches, links, versions] = await Promise.all([
      q<Program>(supabase.from('programs').select('*').eq('id', id).single()),
      q<Reward[]>(supabase.from('rewards').select('*').eq('program_id', id).neq('status', 'archived').order('cost')),
      q<Branch[]>(supabase.from('branches').select('*').eq('merchant_id', merchantId!).eq('active', true).order('name')),
      q<{ branch_id: string }[]>(supabase.from('program_branches').select('branch_id').eq('program_id', id)),
      q<any[]>(supabase.from('program_versions').select('version, rules, created_at').eq('program_id', id).order('version', { ascending: false }).limit(20)),
    ]);
    return { program, rewards, branches, branchIds: links.map((l) => l.branch_id), versions };
  }, [id, merchantId]);
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [tab, setTab] = useState<'rules' | 'design' | 'rewards' | 'branches' | 'history'>('rules');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | 'archived' | 'paused'>(null);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? 'not_found'} onRetry={reload} />;
  const p = data.program;
  const d = draft ?? (Object.fromEntries([['type', p.type], ...EDITABLE_FIELDS.map((k) => [k, p[k]])]) as ProgramDraft);
  const dirty = draft !== null;
  const readOnly = p.status === 'archived';

  async function save() {
    const err = validateDraft(d);
    if (err) return toast.err(err);
    setSaving(true);
    try {
      const patch = Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, d[k]]));
      await q(supabase.from('programs').update(patch).eq('id', p.id));
      toast.ok(p.status === 'active' ? 'Cambios guardados. Las nuevas reglas aplican desde ahora; los saldos existentes se conservan.' : 'Cambios guardados.');
      setDraft(null);
      reload();
    } catch (e) { toast.err(errorMessage(e)); } finally { setSaving(false); }
  }
  async function setStatus(s: string) {
    try { await rpc('set_program_status', { p_program: p.id, p_status: s }); toast.ok(s === 'active' ? '¡Tarjeta publicada!' : 'Estado actualizado.'); reload(); }
    catch (e) { toast.err(errorMessage(e)); }
  }

  return (
    <>
      <PageHeader title={p.name} subtitle={<>{programType(p.type).label} · <Badge kind={PROGRAM_STATUS[p.status].badge.replace('badge-', '') as any}>{PROGRAM_STATUS[p.status].label}</Badge> · versión {p.version}</>}
        actions={<>
          {(p.status === 'draft' || p.status === 'paused') && <Button variant="primary" icon={p.status === 'draft' ? <Rocket size={16} /> : <Play size={16} />} onClick={() => setStatus('active')} disabled={dirty}>{p.status === 'draft' ? 'Publicar' : 'Reanudar'}</Button>}
          {p.status === 'active' && <Button icon={<Pause size={16} />} onClick={() => setConfirm('paused')}>Pausar</Button>}
          <Button icon={<Copy size={16} />} onClick={async () => { try { const nid = await rpc<string>('duplicate_program', { p_program: p.id }); toast.ok('Tarjeta duplicada como borrador.'); nav(`/panel/tarjetas/${nid}`); } catch (e) { toast.err(errorMessage(e)); } }}>Duplicar</Button>
          {!readOnly && <Button variant="ghost" icon={<Archive size={16} />} onClick={() => setConfirm('archived')}>Archivar</Button>}
        </>} />
      {readOnly && <Alert kind="info">Esta tarjeta está archivada: se conserva el historial pero no se puede editar. Duplicala para reutilizarla.</Alert>}
      {p.status === 'draft' && data.rewards.length === 0 && <Alert kind="warn">Agregá al menos una recompensa para poder publicar.</Alert>}
      <div className="mt-2 mb-2"><Tabs value={tab} onChange={setTab} items={[{ id: 'rules', label: 'Reglas' }, { id: 'design', label: 'Diseño' }, { id: 'rewards', label: `Recompensas (${data.rewards.length})` }, { id: 'branches', label: 'Sucursales' }, { id: 'history', label: 'Historial' }]} /></div>

      {(tab === 'rules' || tab === 'design') && (
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
          {p.status === 'active' && tab === 'rules' && <Alert kind="info">Si cambiás las reglas se crea una nueva versión. Los movimientos anteriores conservan las reglas con que se registraron y los saldos acumulados se mantienen.</Alert>}
          <ProgramForm draft={d} onChange={setDraft} merchantId={merchantId!} merchantName={current!.name} rewardName={data.rewards[0]?.name} section={tab} />
          <div className="row"><Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>Guardar cambios</Button>{dirty && <Button variant="ghost" onClick={() => setDraft(null)}>Descartar</Button>}</div>
        </fieldset>
      )}
      {tab === 'rewards' && <RewardsEditor program={p} rewards={data.rewards} branches={data.branches} onChange={reload} readOnly={readOnly} />}
      {tab === 'branches' && <BranchesPicker program={p} branches={data.branches} selected={data.branchIds} onChange={reload} readOnly={readOnly} />}
      {tab === 'history' && (
        <div className="stack-sm">
          {data.versions.map((v) => (
            <details key={v.version} className="faq"><summary>Versión {v.version} · {fmtDateTime(v.created_at)}</summary>
              <pre className="small muted" style={{ whiteSpace: 'pre-wrap', margin: '12px 0 0' }}>{JSON.stringify(v.rules, null, 2)}</pre></details>
          ))}
        </div>
      )}
      <ConfirmModal open={!!confirm} title={confirm === 'archived' ? 'Archivar tarjeta' : 'Pausar tarjeta'} danger={confirm === 'archived'}
        body={<p>{confirm === 'archived' ? 'No se podrán sumar ni canjear puntos. El historial se conserva. Esta acción no se puede deshacer (podés duplicarla).' : 'Mientras esté pausada no se suman sellos ni puntos, pero los clientes pueden canjear lo que ya ganaron.'}</p>}
        onClose={() => setConfirm(null)} onConfirm={async () => { await setStatus(confirm!); setConfirm(null); }} />
    </>
  );
}

function RewardsEditor({ program, rewards, branches, onChange, readOnly }: { program: Program; rewards: Reward[]; branches: Branch[]; onChange: () => void; readOnly: boolean }) {
  const { merchantId } = useMerchant();
  const toast = useToast();
  const [edit, setEdit] = useState<Partial<Reward> | null>(null);
  const [busy, setBusy] = useState(false);
  const t = programType(program.type);
  const maxCost = program.stamps_required ?? 1000000;

  async function save() {
    if (!edit) return;
    if (!edit.name || edit.name.trim().length < 2) return toast.err('Poné un nombre a la recompensa.');
    if (!edit.cost || edit.cost < 1 || edit.cost > maxCost) return toast.err(`El requisito debe estar entre 1 y ${maxCost}.`);
    setBusy(true);
    const row = { name: edit.name.trim(), description: edit.description ?? '', cost: edit.cost, terms: edit.terms ?? '', valid_from: edit.valid_from ?? null, valid_until: edit.valid_until ?? null, stock: edit.stock ?? null, max_per_card: edit.max_per_card ?? null, status: edit.status ?? 'active', image_url: edit.image_url ?? null };
    try {
      if (edit.id) await q(supabase.from('rewards').update(row).eq('id', edit.id));
      else await q(supabase.from('rewards').insert({ ...row, merchant_id: merchantId, program_id: program.id }));
      toast.ok('Recompensa guardada.');
      setEdit(null);
      onChange();
    } catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      {program.type === 'milestones' && <Alert kind="info">En hitos, cada recompensa se desbloquea al alcanzar su cantidad de compras y se canjea una vez por cliente. No descuenta el contador.</Alert>}
      {rewards.length === 0 && <Empty icon={<Gift />} title="Sin recompensas">Agregá el premio que obtendrán tus clientes.</Empty>}
      {rewards.map((r) => (
        <div key={r.id} className="card card-tight row-between">
          <div className="grow"><strong>{r.name}</strong> {r.status !== 'active' && <Badge kind="warn">Pausada</Badge>}
            <div className="small muted">{r.cost} {t.units}{r.stock != null ? ` · stock ${r.stock - r.redeemed_count}/${r.stock}` : ''} · {r.redeemed_count} canjes{r.valid_until ? ` · vence ${fmtDate(r.valid_until)}` : ''}</div></div>
          {!readOnly && <div className="row">
            <Button size="sm" onClick={() => setEdit(r)}>Editar</Button>
            <Button size="sm" variant="ghost" aria-label="Archivar recompensa" icon={<Trash2 size={14} />} onClick={async () => { await q(supabase.from('rewards').update({ status: 'archived' }).eq('id', r.id)); onChange(); }} />
          </div>}
        </div>
      ))}
      {!readOnly && <Button icon={<Plus size={16} />} onClick={() => setEdit({ cost: program.stamps_required ?? 100, status: 'active' })}>Agregar recompensa</Button>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar recompensa' : 'Nueva recompensa'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Guardar</Button></>}>
        {edit && <>
          <Input label="Nombre" maxLength={80} value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Ej.: Café mediano gratis" />
          <Input label={`Requisito (${t.units})`} type="number" min={1} max={maxCost} value={edit.cost ?? ''} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) })} />
          <Textarea label="Descripción" maxLength={300} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          <Textarea label="Condiciones" maxLength={1000} value={edit.terms ?? ''} onChange={(e) => setEdit({ ...edit, terms: e.target.value })} placeholder="Ej.: No incluye adicionales." />
          <div className="form-grid">
            <Input label="Stock total (opcional)" type="number" min={0} value={edit.stock ?? ''} onChange={(e) => setEdit({ ...edit, stock: e.target.value === '' ? null : Number(e.target.value) })} />
            <Input label="Máx. por cliente (opcional)" type="number" min={1} value={edit.max_per_card ?? ''} onChange={(e) => setEdit({ ...edit, max_per_card: e.target.value === '' ? null : Number(e.target.value) })} />
            <Input label="Válida desde" type="datetime-local" value={toLocalInput(edit.valid_from)} onChange={(e) => setEdit({ ...edit, valid_from: fromLocalInput(e.target.value) })} />
            <Input label="Válida hasta" type="datetime-local" value={toLocalInput(edit.valid_until)} onChange={(e) => setEdit({ ...edit, valid_until: fromLocalInput(e.target.value) })} />
          </div>
          <Select label="Estado" value={edit.status ?? 'active'} onChange={(e) => setEdit({ ...edit, status: e.target.value as Reward['status'] })}><option value="active">Activa</option><option value="paused">Pausada</option></Select>
          {merchantId && <ImageUpload merchantId={merchantId} folder="rewards" label="Imagen (opcional)" value={edit.image_url ?? null} onChange={(v) => setEdit({ ...edit, image_url: v })} />}
          {branches.length > 1 && <p className="small subtle mb-0">La recompensa está disponible en todas las sucursales del programa.</p>}
        </>}
      </Modal>
    </div>
  );
}

function BranchesPicker({ program, branches, selected, onChange, readOnly }: { program: Program; branches: Branch[]; selected: string[]; onChange: () => void; readOnly: boolean }) {
  const toast = useToast();
  const [all, setAll] = useState(program.all_branches);
  const [ids, setIds] = useState<string[]>(selected);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card stack">
      <Checkbox label="Participan todas las sucursales (incluidas las futuras)" checked={all} disabled={readOnly} onChange={setAll} />
      {!all && branches.map((b) => <Checkbox key={b.id} label={b.name} disabled={readOnly} checked={ids.includes(b.id)} onChange={(v) => setIds(v ? [...ids, b.id] : ids.filter((x) => x !== b.id))} />)}
      {!readOnly && <Button variant="primary" loading={busy} onClick={async () => {
        if (!all && ids.length === 0) return toast.err('Elegí al menos una sucursal.');
        setBusy(true);
        try {
          await q(supabase.from('program_branches').delete().eq('program_id', program.id));
          if (!all) await q(supabase.from('program_branches').insert(ids.map((b) => ({ program_id: program.id, branch_id: b, merchant_id: program.merchant_id }))));
          await q(supabase.from('programs').update({ all_branches: all }).eq('id', program.id));
          toast.ok('Sucursales actualizadas.'); onChange();
        } catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
      }}>Guardar</Button>}
    </div>
  );
}

/** Galería para elegir el diseño de la tarjeta: clásico (colores propios) o temático por rubro. */
function ThemePicker({ draft, merchantName, onPick }: { draft: ProgramDraft; merchantName: string; onPick: (theme: string) => void }) {
  const sample = (theme: string) => ({
    type: draft.type, theme, name: draft.name || 'Tu tarjeta', merchantName, logoUrl: draft.logo_url, bgColor: draft.bg_color,
    textColor: draft.text_color, accentColor: draft.accent_color, stampIcon: draft.stamp_icon,
    stampsRequired: draft.stamps_required ?? 8, goal: 100, balance: Math.ceil((draft.stamps_required ?? 8) / 2),
  });
  return (
    <div className="field">
      <span className="label">Diseño de la tarjeta</span>
      <div className="theme-picker">
        {[CLASSIC_THEME, ...CARD_THEMES].map((t) => (
          <button key={t.id} type="button" className="theme-option" aria-pressed={(draft.theme ?? 'classic') === t.id} onClick={() => onPick(t.id)}>
            {t.id === 'classic' ? <LoyaltyCard compact look={sample('classic')} /> : <ThemedCard look={sample(t.id)} />}
            <strong className="small">{t.emoji} {t.label}</strong>
            <small>{t.rubro}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
