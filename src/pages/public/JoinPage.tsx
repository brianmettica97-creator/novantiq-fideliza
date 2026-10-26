import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { LoyaltyCard } from '../../components/LoyaltyCard';
import { Alert, Button, Empty, Input, Loading } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { errorMessage, opRpc, q, rpc } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { programType } from '../../lib/constants';
import { supabase, SITE_URL } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';

/** Página pública de inscripción (destino del QR del mostrador). No permite modificar saldos. */
export function JoinPage() {
  const { code = '' } = useParams();
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();
  const { data, loading } = useAsync(() => rpc<any>('get_public_program', { p_join_code: code }), [code, user?.id]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  if (loading || authLoading) return <Loading />;
  if (!data) return <div className="container narrow section"><Empty title="Programa no disponible">El enlace no es válido o el programa ya no está activo.</Empty></div>;

  const { program: p, merchant: m, rewards, promotions } = data;
  const t = programType(p.type);

  async function join() {
    setBusy(true); setError(null);
    try {
      if (name.trim() && user) await q(supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user.id));
      const r = await opRpc<{ card_id: string }>('join_program', { p_join_code: code });
      if (!r.ok) throw new Error(r.message);
      await refreshProfile();
      nav(`/mis-tarjetas/${r.card_id}`, { replace: true });
    } catch (e) { setError((e as Error).message || errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <div className="container narrow" style={{ padding: '28px 20px 60px' }}>
      <div className="stack-lg">
        <div className="center stack-sm">
          <span className="eyebrow" style={{ margin: '0 auto' }}>Programa de fidelización</span>
          <h1>{m.name}</h1>
          {m.description && <p className="muted mb-0">{m.description}</p>}
        </div>
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <LoyaltyCard look={{ theme: p.theme, type: p.type, name: p.name, merchantName: m.name, logoUrl: p.logo_url, bgColor: p.bg_color, textColor: p.text_color, accentColor: p.accent_color, stampIcon: p.stamp_icon, stampsRequired: p.stamps_required, balance: p.welcome_bonus ?? 0, rewardName: rewards[0]?.name }} />
        </div>
        <div className="card stack-sm">
          <h3 className="mb-0">¿Cómo funciona?</h3>
          <p className="muted mb-0">
            {p.type === 'points' ? `Sumás ${p.earn_points} ${t.units} por cada $${Number(p.earn_amount).toLocaleString('es-AR')} de compra.`
              : p.type === 'milestones' ? 'Cada compra suma a tu contador. Al alcanzar cada objetivo desbloqueás un premio.'
              : `Sumás 1 ${t.unit} por cada ${p.type === 'visits' ? 'visita' : 'compra'} elegible. Con ${p.stamps_required} ${t.units} obtenés tu premio.`}
            {p.welcome_bonus > 0 && ` ¡Te regalamos ${p.welcome_bonus} ${t.units} de bienvenida!`}
          </p>
          {rewards.map((r: any, i: number) => <div key={i} className="row small"><Gift size={14} color="var(--lime)" /> <strong>{r.name}</strong> <span className="muted">· {r.cost} {t.units}</span></div>)}
          {p.ends_at && <span className="small subtle">Vigente hasta el {fmtDate(p.ends_at)}</span>}
        </div>
        {promotions.map((pr: any, i: number) => <div key={i} className="card card-accent card-tight"><strong>{pr.title}</strong><div className="small muted">{pr.description}</div></div>)}

        {data.already_member ? (
          <Link to="/mis-tarjetas" className="btn btn-primary btn-lg btn-block">Ya estás adentro · Ver mi tarjeta</Link>
        ) : !data.joinable ? (
          <Alert kind="warn">Este programa no está recibiendo nuevas inscripciones en este momento.</Alert>
        ) : user ? (
          <div className="card stack">
            {!profile?.full_name && <Input label="¿Cómo te llamás?" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} hint="El comercio lo verá al escanear tu tarjeta." />}
            {error && <Alert kind="err">{error}</Alert>}
            <Button variant="primary" size="lg" block loading={busy} onClick={join}>Sumarme gratis</Button>
          </div>
        ) : sent ? (
          <Alert kind="ok">Te enviamos un enlace a <strong>{email}</strong>. Abrilo desde este celular para activar tu tarjeta.</Alert>
        ) : (
          <form className="card stack" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setError(null);
            const { error } = await supabase.auth.signInWithOtp({ email, options: { data: { full_name: name.trim() }, emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(`/unirse/${code}`)}` } });
            setBusy(false);
            if (error) setError(errorMessage(error)); else setSent(true);
          }}>
            <h3 className="mb-0">Obtené tu tarjeta en 1 minuto</h3>
            <p className="small muted mb-0">Sin descargar apps. Solo necesitamos tu nombre y correo.</p>
            <Input label="Nombre" required value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
            <Input label="Correo electrónico" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <p className="small subtle mb-0">Al continuar aceptás los <Link to="/terminos">términos</Link> y la <Link to="/privacidad">política de privacidad</Link>. Tus datos se comparten solo con {m.name}.</p>
            {error && <Alert kind="err">{error}</Alert>}
            <Button variant="primary" size="lg" block type="submit" loading={busy}>Recibir enlace de acceso</Button>
            <Link className="small center" to={`/ingresar?next=${encodeURIComponent(`/unirse/${code}`)}`}>Ya tengo cuenta con contraseña</Link>
          </form>
        )}
        {p.terms && <details className="small"><summary>Condiciones</summary><p className="muted mt-1" style={{ whiteSpace: 'pre-wrap' }}>{p.terms}</p></details>}
      </div>
    </div>
  );
}
