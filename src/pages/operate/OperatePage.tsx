import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Gift, Keyboard, Minus, Plus, ScanLine, Search, XCircle } from 'lucide-react';
import { LoyaltyCard } from '../../components/LoyaltyCard';
import { QrScanner } from '../../components/QrScanner';
import { Alert, Badge, Button, ConfirmModal, Empty, Input, Loading, PageHeader, Select } from '../../components/ui';
import { useMerchant } from '../../context/MerchantContext';
import { newIdempotencyKey, opRpc, q, rpc } from '../../lib/api';
import { classifyScan, formatCardCode } from '../../lib/qr';
import { programType } from '../../lib/constants';
import { fmtRelative } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import type { Branch, CardReward } from '../../lib/types';

type Mode = 'idle' | 'scan' | 'manual' | 'search';
interface Lookup { card: any; customer: any; program: any; rewards: CardReward[]; recent: any[]; method: string }

const BRANCH_KEY = 'nf.branch';

/** Interfaz de mostrador: escanear, sumar, canjear. Pensada para usar con una mano. */
export function OperatePage() {
  const { current, merchantId } = useMerchant();
  const { data: branches, loading } = useAsync(
    () => q<Branch[]>(supabase.from('branches').select('*').eq('merchant_id', merchantId!).eq('active', true).order('name')),
    [merchantId],
  );
  const allowed = useMemo(() => (branches ?? []).filter((b) => current?.all_branches || ['owner', 'admin'].includes(current?.role ?? '') || current?.branch_ids.includes(b.id)), [branches, current]);
  const [branchId, setBranchId] = useState<string>(() => { try { return localStorage.getItem(BRANCH_KEY) ?? ''; } catch { return ''; } });
  useEffect(() => {
    if (allowed.length && !allowed.some((b) => b.id === branchId)) setBranchId(allowed[0].id);
  }, [allowed, branchId]);
  useEffect(() => { try { if (branchId) localStorage.setItem(BRANCH_KEY, branchId); } catch { /* sin almacenamiento */ } }, [branchId]);

  const [mode, setMode] = useState<Mode>('idle');
  const [ref, setRef] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [units, setUnits] = useState(1);
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<{ ok: boolean; title: string; text?: string } | null>(null);
  const [opKey, setOpKey] = useState(newIdempotencyKey());
  const [redeemTarget, setRedeemTarget] = useState<CardReward | null>(null);

  const reset = () => { setRef(null); setLookup(null); setLookupError(null); setUnits(1); setAmount(''); setResult(null); setOpKey(newIdempotencyKey()); setMode('idle'); };

  const resolve = useCallback(async (raw: string) => {
    setMode('idle');
    setLookupError(null);
    setResult(null);
    const scan = classifyScan(raw);
    if (scan.kind === 'join') { setLookupError('Ese es el QR de inscripción del comercio, no la tarjeta de un cliente. Pedile al cliente que abra su tarjeta.'); return; }
    const value = scan.kind === 'card' ? scan.value : raw;
    setBusy(true);
    const r = await opRpc<Lookup>('staff_lookup_card', { p_merchant: merchantId, p_branch: branchId, p_card_ref: value });
    setBusy(false);
    if (!r.ok) { setLookupError(r.message); return; }
    setRef(value);
    setLookup(r as unknown as Lookup);
    setOpKey(newIdempotencyKey());
  }, [merchantId, branchId]);

  async function refreshLookup() {
    if (!ref) return;
    const r = await opRpc<Lookup>('staff_lookup_card', { p_merchant: merchantId, p_branch: branchId, p_card_ref: ref });
    if (r.ok) setLookup(r as unknown as Lookup);
  }

  async function doEarn() {
    if (!lookup || !ref) return;
    setBusy(true);
    const isPoints = lookup.program.type === 'points';
    const r = await opRpc<any>('record_earn', {
      p_merchant: merchantId, p_branch: branchId, p_card_ref: ref, p_idempotency_key: opKey,
      p_units: isPoints ? null : units, p_amount: isPoints ? Number(amount.replace(/\./g, '').replace(',', '.')) : null,
    });
    setBusy(false);
    if (r.ok) {
      const t = programType(lookup.program.type);
      setResult({ ok: true, title: `+${r.units} ${r.units === 1 ? t.unit : t.units}`, text: `Saldo: ${r.balance} ${t.units}${r.rewards_ready > 0 ? ' · ¡Tiene recompensas para canjear!' : ''}${r.duplicate ? ' (ya estaba registrado)' : ''}` });
      navigator.vibrate?.([40, 40, 40]);
      setOpKey(newIdempotencyKey());
      setUnits(1); setAmount('');
      refreshLookup();
    } else {
      setResult({ ok: false, title: 'No se registró', text: r.message });
      if (r.error !== 'rate_limited') setOpKey(newIdempotencyKey());
    }
  }

  async function doRedeem(reward: CardReward) {
    if (!ref) return;
    const r = await opRpc<any>('redeem_reward', { p_merchant: merchantId, p_branch: branchId, p_card_ref: ref, p_reward: reward.id, p_idempotency_key: opKey });
    setRedeemTarget(null);
    if (r.ok) {
      setResult({ ok: true, title: 'Canje registrado', text: `Entregá: ${reward.name}. Saldo restante: ${r.balance}.` });
      navigator.vibrate?.([60, 40, 60]);
      refreshLookup();
    } else {
      setResult({ ok: false, title: 'No se pudo canjear', text: r.message });
    }
    setOpKey(newIdempotencyKey());
  }

  if (loading) return <Loading />;
  if (!allowed.length) return <Empty title="Sin sucursales habilitadas">Pedile al titular que te habilite en una sucursal activa.</Empty>;
  if (current?.operational_status !== 'ok') return <Alert kind="err">Las operaciones de este comercio están pausadas.</Alert>;

  const p = lookup?.program;
  const t = p ? programType(p.type) : null;

  return (
    <div className="narrow stack">
      <PageHeader title="Mostrador" subtitle={current.name} />
      {allowed.length > 1 && (
        <Select label="Sucursal" value={branchId} onChange={(e) => { setBranchId(e.target.value); reset(); }}>
          {allowed.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      )}

      {!lookup && mode === 'idle' && (
        <div className="stack">
          <Button variant="primary" size="xl" icon={<ScanLine size={26} />} onClick={() => setMode('scan')} loading={busy}>Escanear tarjeta</Button>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Button size="lg" icon={<Keyboard size={18} />} onClick={() => setMode('manual')}>Código</Button>
            <Button size="lg" icon={<Search size={18} />} onClick={() => setMode('search')}>Buscar</Button>
          </div>
          {lookupError && <Alert kind="err">{lookupError}</Alert>}
        </div>
      )}

      {mode === 'scan' && <QrScanner onResult={resolve} onCancel={() => setMode('idle')} />}
      {mode === 'manual' && <ManualCode onSubmit={resolve} onCancel={() => setMode('idle')} busy={busy} />}
      {mode === 'search' && <CustomerSearch merchantId={merchantId!} onPick={resolve} onCancel={() => setMode('idle')} />}

      {lookup && p && t && (
        <div className="stack">
          <div className="row-between">
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{lookup.customer?.name ?? 'Cliente sin nombre'}</div>
              <div className="small muted">{lookup.customer?.email} · <span className="mono">{formatCardCode(lookup.card.code)}</span> · {lookup.method === 'qr' ? 'QR verificado' : 'Código manual'}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={reset}>Otro cliente</Button>
          </div>
          <LoyaltyCard compact look={{ type: p.type, name: p.name, merchantName: current.name, bgColor: p.bg_color, textColor: p.text_color, accentColor: p.accent_color, stampIcon: p.stamp_icon, stampsRequired: p.stamps_required, balance: lookup.card.balance }} />

          {result && (
            <div className={`result-flash ${result.ok ? 'ok' : 'err'}`} role="status">
              {result.ok ? <CheckCircle2 size={40} color="var(--ok)" style={{ margin: '0 auto' }} /> : <XCircle size={40} color="var(--err)" style={{ margin: '0 auto' }} />}
              <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{result.title}</div>
              {result.text && <div className="muted">{result.text}</div>}
            </div>
          )}

          {lookup.card.status !== 'active' ? <Alert kind="err">Tarjeta bloqueada. No se pueden registrar operaciones.</Alert> : p.status !== 'active' ? (
            <Alert kind="warn">El programa está pausado: no se suman {t.units}, pero se pueden canjear recompensas.</Alert>
          ) : (
            <div className="card stack">
              <strong>Registrar compra elegible</strong>
              {p.type === 'points' ? (
                <Input label="Importe de la compra ($)" inputMode="decimal" className="input-lg" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                  hint={`${p.earn_points} punto(s) cada $${Number(p.earn_amount).toLocaleString('es-AR')}${p.max_amount_per_tx ? ` · máx. $${Number(p.max_amount_per_tx).toLocaleString('es-AR')}` : ''}`} />
              ) : p.type === 'stamps' && p.max_units_per_tx > 1 ? (
                <div className="row" style={{ justifyContent: 'center' }}>
                  <Button size="lg" className="btn-icon" aria-label="Menos" onClick={() => setUnits(Math.max(1, units - 1))}><Minus /></Button>
                  <span style={{ fontSize: '2rem', fontWeight: 700, minWidth: 60, textAlign: 'center' }}>{units}</span>
                  <Button size="lg" className="btn-icon" aria-label="Más" onClick={() => setUnits(Math.min(p.max_units_per_tx, units + 1))}><Plus /></Button>
                </div>
              ) : null}
              <Button variant="primary" size="xl" loading={busy} disabled={p.type === 'points' && !amount} onClick={doEarn}>
                {p.type === 'points' ? 'Sumar puntos' : `Sumar ${units} ${units === 1 ? t.unit : t.units}`}
              </Button>
            </div>
          )}

          <div className="stack-sm">
            <strong><Gift size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Recompensas</strong>
            {lookup.rewards.length === 0 && <p className="muted small">Este programa no tiene recompensas activas.</p>}
            {lookup.rewards.map((r) => (
              <div key={r.id} className="card card-tight row-between">
                <div className="grow"><strong>{r.name}</strong><div className="small muted">{r.cost} {t.units}{r.terms ? ` · ${r.terms}` : ''}</div></div>
                {r.block_reason ? <Badge>{r.block_reason === 'insufficient_balance' ? `Faltan ${r.cost - lookup.card.balance}` : r.block_reason === 'reward_limit_reached' ? 'Ya canjeada' : 'No disponible'}</Badge>
                  : <Button variant="primary" size="sm" disabled={lookup.card.status !== 'active'} onClick={() => setRedeemTarget(r)}>Canjear</Button>}
              </div>
            ))}
          </div>

          {lookup.recent.length > 0 && <div className="small muted">Última actividad: {fmtRelative(lookup.recent[0].created_at)}</div>}
        </div>
      )}

      <ConfirmModal open={!!redeemTarget} title="Confirmar canje" confirmLabel="Entregar y registrar"
        body={redeemTarget && <p>¿Entregás <strong>{redeemTarget.name}</strong> a {lookup?.customer?.name ?? 'este cliente'}? Se descontarán {p?.type === 'milestones' ? 0 : redeemTarget.cost} {t?.units}.</p>}
        onClose={() => setRedeemTarget(null)} onConfirm={() => doRedeem(redeemTarget!)} />
    </div>
  );
}

function ManualCode({ onSubmit, onCancel, busy }: { onSubmit: (v: string) => void; onCancel: () => void; busy: boolean }) {
  const [v, setV] = useState('');
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }}>
      <Input label="Código de la tarjeta" className="input-lg mono" autoFocus maxLength={9} value={v} onChange={(e) => setV(e.target.value.toUpperCase())} placeholder="ABCD-1234" hint="Son 8 caracteres. Figura debajo del QR en el celular del cliente." autoComplete="off" />
      <div className="row"><Button variant="primary" type="submit" loading={busy} disabled={v.replace(/-/g, '').length < 8}>Buscar tarjeta</Button><Button variant="ghost" onClick={onCancel}>Cancelar</Button></div>
    </form>
  );
}

function CustomerSearch({ merchantId, onPick, onCancel }: { merchantId: string; onPick: (code: string) => void; onCancel: () => void }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card stack">
      <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try { const r = await rpc<any>('search_customers', { p_merchant: merchantId, p_query: query, p_limit: 20 }); setRows(r.rows); } finally { setBusy(false); }
      }}>
        <input className="input" autoFocus placeholder="Nombre o correo" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar cliente" />
        <Button type="submit" variant="primary" loading={busy}>Buscar</Button>
      </form>
      {rows && rows.length === 0 && <p className="muted small mb-0">Sin resultados.</p>}
      {rows?.map((r) => (
        <button key={r.card_id} className="choice" onClick={() => onPick(r.code)}>
          <div className="grow"><strong>{r.name ?? 'Sin nombre'}</strong><div className="small muted">{r.email} · {r.program_name} · {r.balance}</div></div>
        </button>
      ))}
      <Alert kind="info">Por seguridad, al buscar por nombre confirmá la identidad del cliente antes de sumar.</Alert>
      <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
    </div>
  );
}
