import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase, SITE_URL } from '../../lib/supabase';
import { errorMessage, rpc } from '../../lib/api';
import { Alert, Button, Input, Loading, Select, Tabs } from '../../components/ui';
import { Turnstile, captchaEnabled } from '../../components/Turnstile';
import { useAuth } from '../../context/AuthContext';
import { useMerchant } from '../../context/MerchantContext';
import { CATEGORIES } from '../../lib/constants';
import { ROLE_LABEL } from '../../lib/permissions';
import { safeNext } from '../../lib/nav';


function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="card auth-card stack">
        <div><h1 style={{ fontSize: '1.6rem' }}>{title}</h1>{subtitle && <p className="muted mb-0">{subtitle}</p>}</div>
        {children}
      </div>
    </div>
  );
}

function SentNotice({ email, what }: { email: string; what: string }) {
  return (
    <div className="stack center">
      <div className="empty-icon"><MailCheck /></div>
      <p>Te enviamos {what} a <strong>{email}</strong>. Revisá también la carpeta de spam.</p>
    </div>
  );
}

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { user } = useAuth();
  const [mode, setMode] = useState<'password' | 'magic'>(params.get('modo') === 'enlace' ? 'magic' : 'password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const onToken = useCallback((t: string) => setCaptcha(t), []);
  const nav = useNavigate();

  if (user) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captcha || undefined } });
        if (error) throw error;
        nav(next, { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email, options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`, captchaToken: captcha || undefined },
        });
        if (error) throw error;
        setSent(true);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Ingresar" subtitle="Comercios, equipos y clientes usan la misma cuenta.">
      <Tabs value={mode} onChange={(m) => { setMode(m); setSent(false); }} items={[{ id: 'password', label: 'Con contraseña' }, { id: 'magic', label: 'Enlace por correo' }]} />
      {sent ? <SentNotice email={email} what="un enlace para ingresar" /> : (
        <form className="stack" onSubmit={submit}>
          <Input label="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode === 'password' && <Input label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
          <Turnstile onToken={onToken} />
          {error && <Alert kind="err">{error}</Alert>}
          <Button variant="primary" type="submit" loading={busy} block disabled={captchaEnabled && !captcha}>{mode === 'password' ? 'Ingresar' : 'Enviarme el enlace'}</Button>
        </form>
      )}
      <div className="row-between small">
        <Link to="/recuperar">Olvidé mi contraseña</Link>
        <Link to={`/registro?next=${encodeURIComponent(next)}`}>Crear cuenta</Link>
      </div>
    </AuthCard>
  );
}

export function RegisterPage() {
  const [params] = useSearchParams();
  const next = params.get('next') ? safeNext(params.get('next')) : '/crear-comercio';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const onToken = useCallback((t: string) => setCaptcha(t), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (!accept) return setError('Tenés que aceptar los términos y la política de privacidad.');
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`, captchaToken: captcha || undefined },
      });
      if (error) throw error;
      // Supabase devuelve un usuario sin identidades si el correo ya existía (no revela la cuenta)
      setSent(true);
      void data;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Creá tu cuenta" subtitle="14 días de prueba gratis. Sin tarjeta de crédito.">
      {sent ? <SentNotice email={email} what="un enlace para confirmar tu correo" /> : (
        <form className="stack" onSubmit={submit}>
          <Input label="Tu nombre" required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Correo electrónico" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Contraseña" type="password" required minLength={8} autoComplete="new-password" hint="Mínimo 8 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} />
          <label className="checkbox"><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>Acepto los <Link to="/terminos" target="_blank">términos y condiciones</Link> y la <Link to="/privacidad" target="_blank">política de privacidad</Link>.</span></label>
          <Turnstile onToken={onToken} />
          {error && <Alert kind="err">{error}</Alert>}
          <Button variant="primary" type="submit" loading={busy} block disabled={captchaEnabled && !captcha}>Crear cuenta</Button>
        </form>
      )}
      <p className="small center mb-0">¿Ya tenés cuenta? <Link to="/ingresar">Ingresá</Link></p>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthCard title="Recuperar contraseña" subtitle="Te enviaremos un enlace seguro para crear una nueva.">
      {sent ? <SentNotice email={email} what="las instrucciones" /> : (
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError(null);
          const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/auth/callback?next=/restablecer` });
          setBusy(false);
          // Por privacidad se muestra el mismo mensaje exista o no la cuenta
          if (error && /rate/i.test(error.message)) setError(errorMessage(error)); else setSent(true);
        }}>
          <Input label="Correo electrónico" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <Alert kind="err">{error}</Alert>}
          <Button variant="primary" type="submit" loading={busy} block>Enviar enlace</Button>
        </form>
      )}
      <Link to="/ingresar" className="small">Volver a ingresar</Link>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const { user, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  if (loading) return <Loading />;
  if (!user) return <AuthCard title="Enlace vencido"><Alert kind="warn">El enlace ya no es válido. Pedí uno nuevo.</Alert><Link to="/recuperar">Recuperar contraseña</Link></AuthCard>;
  return (
    <AuthCard title="Nueva contraseña">
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < 8) return setError('Mínimo 8 caracteres.');
        setBusy(true);
        const { error } = await supabase.auth.updateUser({ password });
        setBusy(false);
        if (error) setError(errorMessage(error)); else nav('/inicio', { replace: true });
      }}>
        <Input label="Nueva contraseña" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Alert kind="err">{error}</Alert>}
        <Button variant="primary" type="submit" loading={busy} block>Guardar contraseña</Button>
      </form>
    </AuthCard>
  );
}

/** Destino de los enlaces de correo. supabase-js intercambia el código PKCE automáticamente. */
export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const err = params.get('error_description');
  if (err) return <AuthCard title="No pudimos validar el enlace"><Alert kind="err">{err}</Alert><Link to="/ingresar">Volver a ingresar</Link></AuthCard>;
  if (loading || !user) return <Loading />;
  return <Navigate to={safeNext(params.get('next'))} replace />;
}

/** Decide a dónde ir después de ingresar según las membresías del usuario. */
export function HomeRedirect() {
  const { user, loading } = useAuth();
  const { memberships, loading: mLoading, current } = useMerchant();
  if (loading || (user && mLoading)) return <Loading />;
  if (!user) return <Navigate to="/ingresar" replace />;
  if (!memberships.length) return <Navigate to="/mis-tarjetas" replace />;
  return <Navigate to={current && ['owner', 'admin', 'manager'].includes(current.role) ? '/panel' : '/operar'} replace />;
}

export function CreateMerchantPage() {
  const { user, loading } = useAuth();
  const { refresh, select, memberships } = useMerchant();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('cafeteria');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/registro" replace />;
  return (
    <AuthCard title="Creá tu comercio" subtitle="Empezá con lo básico. El resto lo completás en el asistente.">
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try {
          const id = await rpc<string>('create_merchant', { p_name: name.trim(), p_category: category });
          await refresh();
          select(id);
          nav('/panel/onboarding', { replace: true });
        } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
      }}>
        <Input label="Nombre del negocio" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Café Central" />
        <Select label="Rubro" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
        {error && <Alert kind="err">{error}</Alert>}
        <Button variant="primary" type="submit" loading={busy} block>Crear y continuar</Button>
      </form>
      {memberships.length > 0 && <Link to="/panel" className="small">Volver a mi panel</Link>}
      <Link to="/mis-tarjetas" className="small muted">Soy cliente, quiero ver mis tarjetas</Link>
    </AuthCard>
  );
}

export function AcceptInvitationPage() {
  const { token = '' } = useParams();
  const { user, loading } = useAuth();
  const { refresh, select } = useMerchant();
  const [info, setInfo] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  useEffect(() => { rpc('get_invitation', { p_token: token }).then(setInfo).catch(() => setInfo(null)); }, [token]);
  if (loading || info === undefined) return <Loading />;
  if (!info) return <AuthCard title="Invitación inválida"><Alert kind="err">El enlace no es válido.</Alert></AuthCard>;
  const next = `/invitacion/${token}`;
  return (
    <AuthCard title={`Unite a ${info.merchant_name}`} subtitle={`Te invitaron como ${ROLE_LABEL[info.role as keyof typeof ROLE_LABEL]}. Invitación para ${info.email_hint}.`}>
      {info.status !== 'pending' ? <Alert kind="warn">Esta invitación ya fue utilizada o revocada.</Alert>
        : info.expired ? <Alert kind="warn">La invitación venció. Pedile al comercio una nueva.</Alert>
        : !user ? (
          <div className="stack">
            <p className="muted mb-0">Ingresá o creá una cuenta con el correo invitado para aceptar.</p>
            <Link className="btn btn-primary btn-block" to={`/registro?next=${encodeURIComponent(next)}`}>Crear cuenta</Link>
            <Link className="btn btn-block" to={`/ingresar?next=${encodeURIComponent(next)}`}>Ya tengo cuenta</Link>
          </div>
        ) : (
          <div className="stack">
            {error && <Alert kind="err">{error}</Alert>}
            <Button variant="primary" block loading={busy} onClick={async () => {
              setBusy(true); setError(null);
              try {
                const id = await rpc<string>('accept_invitation', { p_token: token });
                await refresh(); select(id); nav('/inicio', { replace: true });
              } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
            }}>Aceptar invitación</Button>
          </div>
        )}
    </AuthCard>
  );
}
