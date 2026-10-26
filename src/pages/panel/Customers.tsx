import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Lock, Undo2, Unlock, Users } from 'lucide-react';
import { LoyaltyCard } from '../../components/LoyaltyCard';
import { Alert, Badge, Button, ConfirmModal, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select } from '../../components/ui';
import { useMerchant } from '../../context/MerchantContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage, newIdempotencyKey, opRpc, q, rpc } from '../../lib/api';
import { downloadCsv, fmtDateTime, fmtMoney, fmtRelative } from '../../lib/format';
import { formatCardCode } from '../../lib/qr';
import { programType, TX_TYPE } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import type { Branch } from '../../lib/types';

const PAGE = 25;

export function CustomersPage() {
  const { merchantId, hasFeature, can } = useMerchant();
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAsync(() => rpc<any>('search_customers', { p_merchant: merchantId, p_query: applied || null, p_limit: PAGE, p_offset: page * PAGE }), [merchantId, applied, page]);
  const toast = useToast();
  const nav = useNavigate();

  async function exportCsv() {
    try {
      const all = await rpc<any>('search_customers', { p_merchant: merchantId, p_query: applied || null, p_limit: 500, p_offset: 0 });
      downloadCsv('clientes.csv', all.rows.map((r: any) => ({ nombre: r.name, email: r.email, telefono: r.phone, codigo: r.code, tarjeta: r.program_name, saldo: r.balance, acumulado: r.lifetime_earned, estado: r.status, alta: r.created_at, ultima_actividad: r.last_activity_at })));
      if (all.total > 500) toast.info('Se exportaron los primeros 500 clientes.');
    } catch (e) { toast.err(errorMessage(e)); }
  }

  return (
    <>
      <PageHeader title="Clientes" subtitle={data ? `${data.total} tarjeta(s)` : undefined}
        actions={can('stats') && (hasFeature('export') ? <Button icon={<Download size={16} />} onClick={exportCsv}>Exportar CSV</Button> : <Badge kind="warn">Exportar: plan Profesional</Badge>)} />
      <form className="row mb-2" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(query.trim()); }}>
        <input className="input" placeholder="Buscar por nombre, correo o código" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar clientes" />
        <Button type="submit">Buscar</Button>
      </form>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && (data.rows.length === 0 ? (
        <Empty icon={<Users />} title={applied ? 'Sin resultados' : 'Todavía no hay clientes'}>{applied ? 'Probá con otro nombre o código.' : 'Compartí el QR de inscripción en tu mostrador para que tus clientes se sumen.'}</Empty>
      ) : (
        <>
          <div className="table-wrap"><table className="table table-stack">
            <thead><tr><th>Cliente</th><th>Tarjeta</th><th>Saldo</th><th>Última actividad</th><th>Estado</th></tr></thead>
            <tbody>{data.rows.map((r: any) => (
              <tr key={r.card_id} className="clickable" onClick={() => nav(`/panel/clientes/${r.card_id}`)}>
                <td data-label="Cliente"><Link to={`/panel/clientes/${r.card_id}`}><strong>{r.name ?? 'Sin nombre'}</strong></Link><div className="small subtle">{r.email}</div></td>
                <td data-label="Tarjeta">{r.program_name}<div className="small subtle mono">{formatCardCode(r.code)}</div></td>
                <td data-label="Saldo"><strong>{r.balance}</strong>{r.stamps_required ? ` / ${r.stamps_required}` : ''} <span className="subtle small">{programType(r.program_type).units}</span></td>
                <td data-label="Última actividad">{fmtRelative(r.last_activity_at)}</td>
                <td data-label="Estado">{r.status === 'active' ? <Badge kind="ok">Activa</Badge> : <Badge kind="err">{r.status === 'blocked' ? 'Bloqueada' : 'Baja'}</Badge>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {data.total > PAGE && <div className="row mt-2" style={{ justifyContent: 'center' }}>
            <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
            <span className="small muted">Página {page + 1} de {Math.ceil(data.total / PAGE)}</span>
            <Button size="sm" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)}>Siguiente</Button>
          </div>}
        </>
      ))}
    </>
  );
}

export function CustomerDetailPage() {
  const { cardId = '' } = useParams();
  const { merchantId, can, current } = useMerchant();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => rpc<any>('get_card_detail', { p_merchant: merchantId, p_card: cardId }), [merchantId, cardId]);
  const [reverse, setReverse] = useState<any>(null);
  const [adjust, setAdjust] = useState(false);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Empty title="Tarjeta no encontrada" />;
  const { card, program: p, customer, rewards, transactions } = data;
  const t = programType(p.type);

  return (
    <div className="stack-lg">
      <Link to="/panel/clientes" className="small"><ArrowLeft size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Clientes</Link>
      <PageHeader title={customer?.name ?? 'Cliente sin nombre'} subtitle={<>{customer?.email}{customer?.phone ? ` · ${customer.phone}` : ''}</>}
        actions={can('adjust') && <>
          <Button onClick={() => { setAdjust(true); setDelta(''); setReason(''); }}>Ajustar saldo</Button>
          <Button variant={card.status === 'active' ? 'danger' : 'secondary'} icon={card.status === 'active' ? <Lock size={16} /> : <Unlock size={16} />} onClick={() => setBlock(true)}>{card.status === 'active' ? 'Bloquear' : 'Desbloquear'}</Button>
        </>} />
      {card.status === 'blocked' && <Alert kind="err">Tarjeta bloqueada{card.status_reason ? `: ${card.status_reason}` : ''}.</Alert>}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <LoyaltyCard look={{ theme: p.theme, type: p.type, name: p.name, merchantName: current!.name, logoUrl: p.logo_url, bgColor: p.bg_color, textColor: p.text_color, accentColor: p.accent_color, stampIcon: p.stamp_icon, stampsRequired: p.stamps_required, balance: card.balance, code: card.code }} />
        <div className="card stack-sm">
          <div className="row-between small"><span className="muted">Saldo actual</span><strong>{card.balance} {t.units}</strong></div>
          <div className="row-between small"><span className="muted">Acumulado histórico</span><strong>{card.lifetime_earned}</strong></div>
          <div className="row-between small"><span className="muted">Canjeado</span><strong>{card.lifetime_redeemed}</strong></div>
          <div className="row-between small"><span className="muted">Alta</span><span>{fmtDateTime(card.created_at)}</span></div>
          <div className="row-between small"><span className="muted">Última actividad</span><span>{fmtRelative(card.last_activity_at)}</span></div>
          <hr />
          {rewards.map((r: any) => <div key={r.id} className="row-between small"><span>{r.name} ({r.cost})</span>{r.block_reason ? <Badge>{r.block_reason === 'insufficient_balance' ? 'Pendiente' : 'No disponible'}</Badge> : <Badge kind="ok">Disponible</Badge>}</div>)}
        </div>
      </div>
      <section>
        <h3>Movimientos</h3>
        <TxTable rows={transactions} canReverse={can('adjust')} onReverse={setReverse} />
      </section>

      <ConfirmModal open={!!reverse} requireReason danger title="Anular movimiento" confirmLabel="Anular"
        body={reverse && <p>Se registrará un movimiento compensatorio de <strong>{-reverse.delta}</strong>. {reverse.type === 'redeem' && 'El canje quedará cancelado y se devolverá el saldo.'} El movimiento original no se borra.</p>}
        onClose={() => setReverse(null)} onConfirm={async (why) => {
          const r = await opRpc('reverse_transaction', { p_transaction: reverse.id, p_reason: why, p_idempotency_key: newIdempotencyKey() });
          if (r.ok) { toast.ok('Movimiento anulado.'); setReverse(null); reload(); } else toast.err(r.message);
        }} />
      <ConfirmModal open={block} requireReason danger={card.status === 'active'} title={card.status === 'active' ? 'Bloquear tarjeta' : 'Desbloquear tarjeta'} confirmLabel="Confirmar"
        onClose={() => setBlock(false)} onConfirm={async (why) => {
          try { await rpc('set_card_status', { p_card: card.id, p_status: card.status === 'active' ? 'blocked' : 'active', p_reason: why }); toast.ok('Estado actualizado.'); setBlock(false); reload(); } catch (e) { toast.err(errorMessage(e)); }
        }} />
      <Modal open={adjust} onClose={() => setAdjust(false)} title="Ajuste manual" footer={<><Button variant="ghost" onClick={() => setAdjust(false)}>Cancelar</Button>
        <Button variant="primary" loading={busy} disabled={!delta || Number(delta) === 0 || reason.trim().length < 3} onClick={async () => {
          setBusy(true);
          const r = await opRpc('adjust_balance', { p_merchant: merchantId, p_card: card.id, p_delta: Math.trunc(Number(delta)), p_reason: reason.trim(), p_idempotency_key: newIdempotencyKey() });
          setBusy(false);
          if (r.ok) { toast.ok('Ajuste registrado.'); setAdjust(false); reload(); } else toast.err(r.message);
        }}>Registrar ajuste</Button></>}>
        <Alert kind="info">Usalo para compensar errores o regalos. Queda registrado con tu nombre y el motivo.</Alert>
        <Input label={`Cantidad de ${t.units} (negativo para restar)`} type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
        <Input label="Motivo" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: compra no registrada el 12/10" />
      </Modal>
    </div>
  );
}

export function TxTable({ rows, canReverse, onReverse, showCustomer }: { rows: any[]; canReverse: boolean; onReverse: (r: any) => void; showCustomer?: boolean }) {
  if (!rows.length) return <p className="muted">Sin movimientos.</p>;
  return (
    <div className="table-wrap"><table className="table table-stack">
      <thead><tr><th>Fecha</th>{showCustomer && <th>Cliente</th>}<th>Tipo</th><th>Cantidad</th><th>Detalle</th><th>Registró</th><th /></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id} style={{ opacity: r.status === 'reversed' ? 0.55 : 1 }}>
          <td data-label="Fecha" className="nowrap">{fmtDateTime(r.created_at)}</td>
          {showCustomer && <td data-label="Cliente"><Link to={`/panel/clientes/${r.card_id}`}>{r.customer_name ?? formatCardCode(r.card_code)}</Link></td>}
          <td data-label="Tipo">{TX_TYPE[r.type]}{r.status === 'reversed' && <> <Badge>Anulado</Badge></>}</td>
          <td data-label="Cantidad"><strong style={{ color: r.delta > 0 ? 'var(--ok)' : r.delta < 0 ? 'var(--err)' : undefined }}>{r.delta > 0 ? '+' : ''}{r.delta}</strong></td>
          <td data-label="Detalle" className="small">{[r.reward_name, r.purchase_amount ? fmtMoney(r.purchase_amount) : null, r.reason, r.branch_name, r.lookup_method === 'code' ? 'código manual' : r.lookup_method === 'qr' ? 'QR' : null].filter(Boolean).join(' · ')}</td>
          <td data-label="Registró" className="small">{r.staff_name ?? '—'}</td>
          <td>{canReverse && r.status === 'completed' && r.type !== 'reversal' && <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} onClick={() => onReverse(r)}>Anular</Button>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

export function TransactionsPage() {
  const { merchantId, can } = useMerchant();
  const toast = useToast();
  const [type, setType] = useState('');
  const [branch, setBranch] = useState('');
  const [page, setPage] = useState(0);
  const { data: branches } = useAsync(() => q<Branch[]>(supabase.from('branches').select('*').eq('merchant_id', merchantId!).order('name')), [merchantId]);
  const { data, error, loading, reload } = useAsync(() => rpc<any>('list_transactions', { p_merchant: merchantId, p_type: type || null, p_branch: branch || null, p_limit: 50, p_offset: page * 50 }), [merchantId, type, branch, page]);
  const [reverse, setReverse] = useState<any>(null);
  return (
    <>
      <PageHeader title="Movimientos" subtitle="Historial completo e inalterable de operaciones." actions={data?.rows.length ? <Button icon={<Download size={16} />} onClick={() => downloadCsv('movimientos.csv', data.rows)}>CSV</Button> : null} />
      <div className="form-grid mb-2">
        <Select label="Tipo" value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}><option value="">Todos</option>{Object.entries(TX_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select label="Sucursal" value={branch} onChange={(e) => { setBranch(e.target.value); setPage(0); }}><option value="">Todas</option>{branches?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && <>
        <TxTable rows={data.rows} showCustomer canReverse={can('adjust')} onReverse={setReverse} />
        {data.total > 50 && <div className="row mt-2" style={{ justifyContent: 'center' }}>
          <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span className="small muted">{page * 50 + 1}–{Math.min(data.total, (page + 1) * 50)} de {data.total}</span>
          <Button size="sm" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</Button>
        </div>}
      </>}
      <ConfirmModal open={!!reverse} requireReason danger title="Anular movimiento" confirmLabel="Anular" onClose={() => setReverse(null)}
        body={<p>Se generará un movimiento compensatorio. El original se conserva en el historial.</p>}
        onConfirm={async (why) => {
          const r = await opRpc('reverse_transaction', { p_transaction: reverse.id, p_reason: why, p_idempotency_key: newIdempotencyKey() });
          if (r.ok) { toast.ok('Movimiento anulado.'); setReverse(null); reload(); } else toast.err(r.message);
        }} />
    </>
  );
}
