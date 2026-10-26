import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Gift, LogOut, QrCode, RefreshCw, Store, Wallet } from 'lucide-react';
import { BrandLogo } from '../../components/Brand';
import { LoyaltyCard } from '../../components/LoyaltyCard';
import { QrImage } from '../../components/QrImage';
import { Alert, Badge, Button, ConfirmModal, Empty, ErrorBox, Input, Loading, Modal } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { callFunction, errorMessage, q, rpc } from '../../lib/api';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { buildCardQrPayload, formatCardCode, secondsToNextStep } from '../../lib/qr';
import { supabase } from '../../lib/supabase';
import { programType, TX_TYPE } from '../../lib/constants';
import { useAsync } from '../../lib/useAsync';
import type { CardReward } from '../../lib/types';

function WalletShell({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  return (
    <>
      <header className="topbar"><div className="container topbar-inner">
        <BrandLogo to="/mis-tarjetas" />
        <nav className="nav-links">
          <Link to="/mis-tarjetas"><Wallet size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Tarjetas</Link>
          <Link to="/mi-cuenta">Mi cuenta</Link>
          <button className="btn btn-ghost btn-sm" onClick={signOut} aria-label="Cerrar sesión"><LogOut size={16} /></button>
        </nav>
      </div></header>
      <main className="container narrow" style={{ padding: '24px 20px 60px' }}>{children}</main>
    </>
  );
}

function RequireUser({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/ingresar?modo=enlace&next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

export function WalletPage() {
  return <RequireUser><WalletShell><WalletList /></WalletShell></RequireUser>;
}

function WalletList() {
  const { data, error, loading, reload } = useAsync(() => rpc<any[]>('get_my_wallet'), []);
  if (loading) return <Loading />;
  return (
    <div className="stack-lg">
      <div><h1>Mis tarjetas</h1><p className="muted mb-0">Mostrá el QR de tu tarjeta en el comercio para sumar y canjear.</p></div>
      <ErrorBox error={error} onRetry={reload} />
      {data && data.length === 0 && (
        <Empty icon={<Wallet />} title="Todavía no tenés tarjetas">
          Escaneá el QR que está en el mostrador del comercio o abrí el enlace que te compartieron para sumarte a su programa.
        </Empty>
      )}
      {data?.map((c) => (
        <Link key={c.card_id} to={`/mis-tarjetas/${c.card_id}`} style={{ display: 'block' }} aria-label={`Abrir ${c.program.name}`}>
          <LoyaltyCard compact look={{
            theme: c.program.theme, type: c.program.type, name: c.program.name, merchantName: c.merchant.name, logoUrl: c.program.logo_url,
            bgColor: c.program.bg_color, textColor: c.program.text_color, accentColor: c.program.accent_color,
            stampIcon: c.program.stamp_icon, stampsRequired: c.program.stamps_required, balance: c.balance,
            rewardName: c.rewards_ready > 0 ? `${c.rewards_ready} recompensa(s) disponible(s)` : undefined,
          }} />
          {c.status === 'blocked' && <div className="mt-1"><Badge kind="err">Bloqueada</Badge></div>}
        </Link>
      ))}
    </div>
  );
}

/** QR que se regenera cada 30 s a partir del secreto de la tarjeta. */
function RotatingQr({ secret, token }: { secret: string; token: string }) {
  const [payload, setPayload] = useState('');
  const [secs, setSecs] = useState(secondsToNextStep());
  useEffect(() => {
    let alive = true;
    const update = async () => {
      const p = await buildCardQrPayload(secret, token);
      if (alive) setPayload(p);
    };
    update();
    const t = setInterval(() => {
      const s = secondsToNextStep();
      setSecs(s);
      if (s === 30) update();
    }, 1000);
    // Al volver a la pestaña, regenerar inmediatamente
    const vis = () => document.visibilityState === 'visible' && update();
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [secret, token]);
  return (
    <div className="stack-sm center">
      {payload ? <QrImage value={payload} alt="QR de tu tarjeta" size={480} /> : <div className="qr-box"><div className="skeleton" style={{ aspectRatio: '1' }} /></div>}
      <span className="small subtle"><RefreshCw size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> Se renueva en {secs}s · Las capturas de pantalla no sirven</span>
    </div>
  );
}

export function WalletCardPage() {
  return <RequireUser><WalletShell><WalletCard /></WalletShell></RequireUser>;
}

function WalletCard() {
  const { cardId = '' } = useParams();
  const { data, error, loading, reload } = useAsync(() => rpc<any>('get_my_card', { p_card: cardId }), [cardId]);
  const [leave, setLeave] = useState(false);
  const toast = useToast();
  const nav = useNavigate();

  // Actualiza el saldo cuando el cliente vuelve a la app (tras sumar en el mostrador)
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && reload(), 20000);
    return () => clearInterval(t);
  }, [reload]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Empty title="Tarjeta no encontrada" action={<Link to="/mis-tarjetas">Volver</Link>} />;
  const { card, program: p, merchant: m, rewards, promotions, history, secret } = data;
  const t = programType(p.type);
  const next = (rewards as CardReward[]).filter((r) => r.block_reason === 'insufficient_balance').sort((a, b) => a.cost - b.cost)[0];
  const ready = (rewards as CardReward[]).filter((r) => !r.block_reason);

  return (
    <div className="stack-lg">
      <Link to="/mis-tarjetas" className="small"><ArrowLeft size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Mis tarjetas</Link>
      <LoyaltyCard look={{
        theme: p.theme, type: p.type, name: p.name, merchantName: m.name, logoUrl: p.logo_url, bgColor: p.bg_color, textColor: p.text_color,
        accentColor: p.accent_color, stampIcon: p.stamp_icon, stampsRequired: p.stamps_required, balance: card.balance,
        rewardName: rewards[0]?.name, code: card.code,
      }} />

      {card.status !== 'active' ? <Alert kind="err">Esta tarjeta está bloqueada. Consultá con el comercio.</Alert> : p.status !== 'active' && <Alert kind="warn">El programa está pausado. Podés canjear lo que ya ganaste.</Alert>}

      <div className="card stack center">
        <h3 className="mb-0"><QrCode size={18} style={{ display: 'inline', verticalAlign: '-3px' }} /> Mostrá este código en el mostrador</h3>
        <RotatingQr secret={secret} token={card.public_token} />
        <div className="small muted">Si no pueden escanearlo, dictá el código <strong className="mono">{formatCardCode(card.code)}</strong></div>
      </div>

      {ready.length > 0 && <Alert kind="ok"><strong>¡Tenés {ready.length} recompensa(s) para canjear!</strong> Pedila en el mostrador mostrando tu QR.</Alert>}
      {next && <div className="card stack-sm">
        <div className="row-between"><strong>Próximo premio: {next.name}</strong><span className="muted small">{card.balance}/{next.cost} {t.units}</span></div>
        <div className="progress"><span style={{ width: `${Math.min(100, (card.balance / next.cost) * 100)}%` }} /></div>
        <span className="small muted">Te faltan {next.cost - card.balance} {t.units}.</span>
      </div>}

      <section className="stack">
        <h2 style={{ fontSize: '1.2rem' }}><Gift size={18} style={{ display: 'inline', verticalAlign: '-3px' }} /> Recompensas</h2>
        {(rewards as CardReward[]).map((r) => (
          <div key={r.id} className="card card-tight row-between">
            <div className="grow"><strong>{r.name}</strong>{r.description && <div className="small muted">{r.description}</div>}
              {r.terms && <div className="small subtle">{r.terms}</div>}
              {r.valid_until && <div className="small subtle">Vence: {fmtDate(r.valid_until)}</div>}</div>
            <Badge kind={!r.block_reason ? 'ok' : ''}>{!r.block_reason ? 'Disponible' : r.block_reason === 'reward_limit_reached' ? 'Ya utilizada' : `${r.cost} ${t.units}`}</Badge>
          </div>
        ))}
      </section>

      {promotions.length > 0 && <section className="stack">
        <h2 style={{ fontSize: '1.2rem' }}>Promociones</h2>
        {promotions.map((pr: any) => <div key={pr.id} className="card card-accent card-tight"><strong>{pr.title}</strong><div className="small muted">{pr.description}</div>{pr.terms && <div className="small subtle">{pr.terms}</div>}{pr.ends_at && <div className="small subtle">Hasta el {fmtDate(pr.ends_at)}</div>}</div>)}
      </section>}

      <section className="stack">
        <h2 style={{ fontSize: '1.2rem' }}>Actividad</h2>
        {history.length === 0 ? <p className="muted">Todavía no hay movimientos.</p> : (
          <div className="card card-tight stack-sm">
            {history.map((h: any) => (
              <div key={h.id} className="row-between small" style={{ opacity: h.status === 'reversed' ? .5 : 1 }}>
                <span>{TX_TYPE[h.type]}{h.reward_name ? `: ${h.reward_name}` : ''}{h.branch_name ? ` · ${h.branch_name}` : ''}{h.status === 'reversed' ? ' (anulado)' : ''}</span>
                <span className="row"><strong style={{ color: h.delta > 0 ? 'var(--ok)' : h.delta < 0 ? 'var(--err)' : undefined }}>{h.delta > 0 ? '+' : ''}{h.delta}</strong><span className="subtle">{fmtDateTime(h.created_at)}</span></span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card stack-sm">
        <h3 className="mb-0"><Store size={16} style={{ display: 'inline', verticalAlign: '-2px' }} /> {m.name}</h3>
        {m.address && <span className="small muted">{m.address}{m.city ? `, ${m.city}` : ''}</span>}
        {m.instagram && <a className="small" href={`https://instagram.com/${m.instagram.replace('@', '')}`} target="_blank" rel="noreferrer">@{m.instagram.replace('@', '')}</a>}
        {p.terms && <details className="small"><summary>Condiciones del programa</summary><p className="muted mt-1" style={{ whiteSpace: 'pre-wrap' }}>{p.terms}</p></details>}
      </section>

      <Button variant="ghost" onClick={() => setLeave(true)}>Dar de baja esta tarjeta</Button>
      <ConfirmModal open={leave} danger title="Dar de baja la tarjeta" confirmLabel="Dar de baja" onClose={() => setLeave(false)}
        body={<p>Dejarás de ver esta tarjeta. El historial queda registrado en el comercio. Si te volvés a sumar, se reactiva con tu saldo.</p>}
        onConfirm={async () => { try { await rpc('leave_program', { p_card: card.id }); toast.ok('Tarjeta dada de baja.'); nav('/mis-tarjetas'); } catch (e) { toast.err(errorMessage(e)); } }} />
    </div>
  );
}

export function AccountPage() {
  return <RequireUser><WalletShell><Account /></WalletShell></RequireUser>;
}

function Account() {
  const { profile, refreshProfile, user, signOut } = useAuth();
  const toast = useToast();
  const [del, setDel] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(profile?.full_name ?? ''); setPhone(profile?.phone ?? ''); }, [profile]);
  return (
    <div className="stack-lg">
      <h1>Mi cuenta</h1>
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try { await q(supabase.from('profiles').update({ full_name: name.trim(), phone: phone.trim() || null }).eq('id', user!.id)); await refreshProfile(); toast.ok('Datos guardados.'); }
        catch (err) { toast.err(errorMessage(err)); } finally { setBusy(false); }
      }}>
        <Input label="Nombre" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} hint="Es lo que ve el comercio al escanear tu tarjeta." />
        <Input label="Teléfono (opcional)" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
        <Button variant="primary" type="submit" loading={busy}>Guardar</Button>
      </form>
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.updateUser({ email });
        if (error) toast.err(errorMessage(error)); else toast.ok('Te enviamos un enlace de confirmación a ambos correos.');
      }}>
        <h3 className="mb-0">Cambiar correo</h3>
        <p className="small muted mb-0">Correo actual: {user?.email}. El cambio se confirma desde ambos correos.</p>
        <Input label="Nuevo correo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit">Solicitar cambio</Button>
      </form>
      <div className="card stack">
        <h3 className="mb-0">Tus datos personales</h3>
        <p className="small muted mb-0">Podés descargar una copia de tus datos o pedir la eliminación de tu cuenta (Ley 25.326).</p>
        <div className="row">
          <Button icon={<Download size={16} />} onClick={async () => {
            const data = await rpc('export_my_data');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            a.download = 'mis-datos-novantiq.json'; a.click();
          }}>Descargar mis datos</Button>
          <Button variant="danger" onClick={() => setDel(true)}>Eliminar mi cuenta</Button>
        </div>
      </div>
      <Modal open={del} onClose={() => setDel(false)} title="Eliminar mi cuenta" footer={<>
        <Button variant="ghost" onClick={() => setDel(false)}>Cancelar</Button>
        <Button variant="danger" disabled={confirmText !== 'ELIMINAR'} loading={busy} onClick={async () => {
          setBusy(true);
          try { await callFunction('delete-account', { confirm: 'ELIMINAR' }); await signOut(); window.location.href = '/'; }
          catch (e) { toast.err(errorMessage(e)); setBusy(false); }
        }}>Eliminar definitivamente</Button></>}>
        <Alert kind="err">Se borrarán tu perfil, tus tarjetas y su historial. No se puede deshacer.</Alert>
        <Input label='Escribí "ELIMINAR" para confirmar' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      </Modal>
    </div>
  );
}
