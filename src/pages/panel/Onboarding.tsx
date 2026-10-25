import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { ImageUpload } from '../../components/ImageUpload';
import { LoyaltyCard } from '../../components/LoyaltyCard';
import { Alert, Badge, Button, ColorInput, Input, Loading, Select, Textarea } from '../../components/ui';
import { useMerchant } from '../../context/MerchantContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage, q, rpc } from '../../lib/api';
import { CATEGORIES, PROGRAM_TYPES, presetFor, programType } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import type { Merchant, Program, ProgramType, Reward } from '../../lib/types';
import { defaultDraft, EDITABLE_FIELDS, ProgramForm, validateDraft, type ProgramDraft } from './Programs';
import { SharePanel } from './Share';

const STEPS = ['Tu negocio', 'Tipo de programa', 'Recompensa', 'Diseño', 'Publicar', 'Compartir'];

/** Asistente de primera configuración. Guarda el avance en merchants.onboarding_step / onboarding_data. */
export function OnboardingPage() {
  const { merchantId, refresh, hasFeature } = useMerchant();
  const toast = useToast();
  const nav = useNavigate();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ProgramDraft>(defaultDraft());
  const [reward, setReward] = useState({ name: '', description: '', terms: '', cost: 8 });
  const [program, setProgram] = useState<Program | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const m = await q<Merchant>(supabase.from('merchants').select('*').eq('id', merchantId!).single());
      setMerchant(m);
      setStep(m.onboarding_completed_at ? 6 : m.onboarding_step);
      const pid = m.onboarding_data?.program_id;
      if (pid) {
        const p = await q<Program | null>(supabase.from('programs').select('*').eq('id', pid).maybeSingle());
        if (p) {
          setProgram(p);
          setDraft(Object.fromEntries([['type', p.type], ...EDITABLE_FIELDS.map((k) => [k, p[k]])]) as ProgramDraft);
          const r = await q<Reward[]>(supabase.from('rewards').select('*').eq('program_id', p.id).limit(1));
          if (r[0]) setReward({ name: r[0].name, description: r[0].description, terms: r[0].terms, cost: r[0].cost });
        }
      } else {
        const pre = presetFor(m.category);
        setDraft({ ...defaultDraft(pre.type), name: pre.program, stamps_required: pre.stamps, stamp_icon: pre.icon, accent_color: m.brand_color, logo_url: null });
        setReward((r) => ({ ...r, name: pre.reward, cost: pre.stamps }));
      }
    })().catch((e) => toast.err(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId]);

  if (!merchant) return <Loading />;

  async function persistStep(n: number, extra: Record<string, unknown> = {}) {
    await q(supabase.from('merchants').update({ onboarding_step: n, onboarding_data: { ...merchant!.onboarding_data, ...extra } }).eq('id', merchant!.id));
    setMerchant({ ...merchant!, onboarding_step: n, onboarding_data: { ...merchant!.onboarding_data, ...extra } });
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
  }

  /** Crea o actualiza el programa en borrador y su recompensa principal. */
  async function saveProgram(): Promise<Program> {
    const err = validateDraft(draft);
    if (err) throw new Error(err);
    if (!reward.name.trim()) throw new Error('Poné un nombre a la recompensa.');
    const cost = draft.type === 'stamps' || draft.type === 'visits' ? draft.stamps_required! : reward.cost;
    const patch = Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, draft[k]]));
    let p: Program;
    if (program && program.type === draft.type && program.status !== 'archived') {
      [p] = await q<Program[]>(supabase.from('programs').update(patch).eq('id', program.id).select());
      await q(supabase.from('rewards').update({ status: 'archived' }).eq('program_id', p.id));
    } else {
      if (program && program.status === 'draft') await rpc('set_program_status', { p_program: program.id, p_status: 'archived' });
      [p] = await q<Program[]>(supabase.from('programs').insert({ ...patch, type: draft.type, merchant_id: merchant!.id }).select());
    }
    await q(supabase.from('rewards').insert({ merchant_id: merchant!.id, program_id: p.id, name: reward.name.trim(), description: reward.description, terms: reward.terms, cost }));
    setProgram(p);
    return p;
  }

  const t = programType(draft.type);

  return (
    <div className="stack-lg" style={{ maxWidth: 980 }}>
      <div className="stack-sm">
        <div className="row-between"><h1 className="mb-0">Configurá tu programa</h1><span className="muted small">Paso {step} de 6 · {STEPS[step - 1]}</span></div>
        <div className="steps" aria-hidden>{STEPS.map((_, i) => <span key={i} className={i < step ? 'done' : ''} />)}</div>
        <p className="muted mb-0">Podés salir cuando quieras: guardamos tu avance.</p>
      </div>

      {step === 1 && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); run(async () => {
          const { name, category, description, logo_url, address, city, province, phone, contact_email, brand_color } = merchant;
          await q(supabase.from('merchants').update({ name, category, description, logo_url, address, city, province, phone, contact_email, brand_color }).eq('id', merchant.id));
          await refresh();
          await persistStep(2);
        }); }}>
          <div className="form-grid">
            <Input label="Nombre del negocio" required maxLength={80} value={merchant.name} onChange={(e) => setMerchant({ ...merchant, name: e.target.value })} />
            <Select label="Rubro" value={merchant.category} onChange={(e) => setMerchant({ ...merchant, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
          </div>
          <Textarea label="Descripción breve (opcional)" maxLength={500} value={merchant.description} onChange={(e) => setMerchant({ ...merchant, description: e.target.value })} />
          <ImageUpload merchantId={merchant.id} folder="logo" value={merchant.logo_url} onChange={(v) => setMerchant({ ...merchant, logo_url: v })} label="Logotipo (opcional)" />
          <div className="form-grid">
            <Input label="Dirección (opcional)" maxLength={200} value={merchant.address ?? ''} onChange={(e) => setMerchant({ ...merchant, address: e.target.value })} />
            <Input label="Ciudad" maxLength={80} value={merchant.city ?? ''} onChange={(e) => setMerchant({ ...merchant, city: e.target.value })} />
            <Input label="Teléfono comercial (opcional)" maxLength={40} value={merchant.phone ?? ''} onChange={(e) => setMerchant({ ...merchant, phone: e.target.value })} />
            <Input label="Correo de contacto" type="email" maxLength={160} value={merchant.contact_email ?? ''} onChange={(e) => setMerchant({ ...merchant, contact_email: e.target.value })} />
          </div>
          <ColorInput label="Color de tu marca" value={merchant.brand_color} onChange={(v) => setMerchant({ ...merchant, brand_color: v })} />
          <div className="row"><Button variant="primary" type="submit" loading={busy}>Continuar</Button></div>
        </form>
      )}

      {step === 2 && (
        <div className="stack">
          {PROGRAM_TYPES.map((pt) => {
            const locked = pt.feature && !hasFeature(pt.feature);
            return (
              <button key={pt.id} className="choice" aria-pressed={draft.type === pt.id} disabled={!!locked} onClick={() => {
                const pre = presetFor(merchant.category);
                setDraft({ ...defaultDraft(pt.id as ProgramType), name: draft.name || pre.program, stamp_icon: draft.stamp_icon, bg_color: draft.bg_color, text_color: draft.text_color, accent_color: draft.accent_color, stamps_required: pt.id === 'stamps' || pt.id === 'visits' ? (draft.stamps_required ?? pre.stamps) : null });
                setReward({ ...reward, cost: pt.id === 'points' ? 100 : pt.id === 'milestones' ? 5 : reward.cost });
              }}>
                <div className="choice-icon">{draft.type === pt.id ? <Check size={20} /> : null}</div>
                <div className="grow"><strong>{pt.label}</strong> {locked && <Badge kind="warn">Plan Profesional</Badge>}<div className="small muted">{pt.description}</div></div>
              </button>
            );
          })}
          <Alert kind="info">¿Querés un beneficio de bienvenida? Lo configurás en el próximo paso: se otorga una sola vez cuando el cliente se suma.</Alert>
          <div className="row"><Button variant="ghost" onClick={() => setStep(1)}>Atrás</Button><Button variant="primary" loading={busy} onClick={() => run(() => persistStep(3))}>Continuar</Button></div>
        </div>
      )}

      {step === 3 && (
        <div className="card stack">
          <ProgramForm draft={draft} onChange={setDraft} merchantId={merchant.id} merchantName={merchant.name} rewardName={reward.name} section="rules" />
          <hr />
          <h3 className="mb-0">Recompensa principal</h3>
          <div className="form-grid">
            <Input label="¿Qué gana el cliente?" maxLength={80} value={reward.name} onChange={(e) => setReward({ ...reward, name: e.target.value })} placeholder="Ej.: Un café mediano gratis" />
            {(draft.type === 'points' || draft.type === 'milestones') && <Input label={`Requisito (${t.units})`} type="number" min={1} value={reward.cost} onChange={(e) => setReward({ ...reward, cost: Number(e.target.value) })} />}
          </div>
          <Textarea label="Aclaraciones de la recompensa" maxLength={1000} value={reward.terms} onChange={(e) => setReward({ ...reward, terms: e.target.value })} placeholder="Ej.: Tamaño mediano. Válido de lunes a viernes." />
          <p className="small subtle mb-0">Podrás agregar más recompensas después, desde “Tarjetas y recompensas”.</p>
          <div className="row"><Button variant="ghost" onClick={() => setStep(2)}>Atrás</Button>
            <Button variant="primary" loading={busy} onClick={() => run(async () => { const p = await saveProgram(); await persistStep(4, { program_id: p.id }); })}>Continuar</Button></div>
        </div>
      )}

      {step === 4 && (
        <div className="card stack">
          <ProgramForm draft={draft} onChange={setDraft} merchantId={merchant.id} merchantName={merchant.name} rewardName={reward.name} section="design" />
          <div className="row"><Button variant="ghost" onClick={() => setStep(3)}>Atrás</Button>
            <Button variant="primary" loading={busy} onClick={() => run(async () => {
              const patch = { bg_color: draft.bg_color, text_color: draft.text_color, accent_color: draft.accent_color, stamp_icon: draft.stamp_icon, logo_url: draft.logo_url };
              const [p] = await q<Program[]>(supabase.from('programs').update(patch).eq('id', program!.id).select());
              setProgram(p);
              await persistStep(5);
            })}>Continuar</Button></div>
        </div>
      )}

      {step === 5 && program && (
        <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <h2>Así la verán tus clientes</h2>
          <LoyaltyCard look={{ type: draft.type, name: draft.name, merchantName: merchant.name, logoUrl: draft.logo_url ?? merchant.logo_url, bgColor: draft.bg_color, textColor: draft.text_color, accentColor: draft.accent_color, stampIcon: draft.stamp_icon, stampsRequired: draft.stamps_required, balance: 0, rewardName: reward.name, code: 'ABCD1234' }} />
          <p className="muted" style={{ maxWidth: 520 }}>Al publicarla, tus clientes podrán sumarse con un QR o un enlace. Tu equipo registrará cada compra desde el mostrador.</p>
          <div className="row"><Button variant="ghost" onClick={() => setStep(4)}>Atrás</Button>
            <Button variant="primary" size="lg" loading={busy} onClick={() => run(async () => {
              if (program.status !== 'active') await rpc('set_program_status', { p_program: program.id, p_status: 'active' });
              const p = await q<Program>(supabase.from('programs').select('*').eq('id', program.id).single());
              setProgram(p);
              await persistStep(6);
              toast.ok('¡Tu tarjeta está publicada!');
            })}>Publicar tarjeta</Button></div>
        </div>
      )}

      {step === 6 && program && (
        <div className="stack">
          <Alert kind="ok"><strong>¡Listo!</strong> Imprimí el afiche para el mostrador o compartí el enlace en tus redes.</Alert>
          <SharePanel program={program} merchantName={merchant.name} />
          <div className="row no-print"><Button variant="primary" size="lg" loading={busy} onClick={() => run(async () => {
            await rpc('complete_onboarding', { p_merchant: merchant.id });
            await refresh();
            nav('/panel', { replace: true });
          })}>Ir a mi panel</Button></div>
        </div>
      )}
    </div>
  );
}
