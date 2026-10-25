import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { BarChart } from '../../components/BarChart';
import { ErrorBox, LinkButton, Loading, PageHeader, Stat, Tabs } from '../../components/ui';
import { useMerchant } from '../../context/MerchantContext';
import { rpc } from '../../lib/api';
import { fmtNum } from '../../lib/format';
import { programType } from '../../lib/constants';
import { useAsync } from '../../lib/useAsync';

export function PanelHome() {
  const { merchantId, current } = useMerchant();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const { data: d, error, loading, reload } = useAsync(() => rpc<any>('merchant_dashboard', { p_merchant: merchantId, p_days: Number(days) }), [merchantId, days]);
  const [series, setSeries] = useState<'operations' | 'redemptions' | 'new_cards'>('operations');

  return (
    <>
      <PageHeader title={`Hola, ${current?.name}`} subtitle="Así viene tu programa de fidelización."
        actions={<><Tabs value={days} onChange={setDays} items={[{ id: '7', label: '7 días' }, { id: '30', label: '30 días' }, { id: '90', label: '90 días' }]} /><LinkButton to="/operar" variant="primary" icon={<ScanLine size={16} />}>Mostrador</LinkButton></>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !d ? <Loading /> : d && (
        <div className="stack-lg">
          <div className="grid-4">
            <Stat label="Clientes registrados" value={fmtNum(d.customers_total)} hint={`+${fmtNum(d.customers_new)} en el período`} />
            <Stat label="Clientes activos" value={fmtNum(d.customers_active)} hint="Con al menos una compra" />
            <Stat label="Clientes que volvieron" value={fmtNum(d.customers_returning)} hint={d.customers_active ? `${Math.round((d.customers_returning / d.customers_active) * 100)}% de los activos` : '2 o más compras'} />
            <Stat label="Tarjetas activas" value={fmtNum(d.cards_active)} />
            <Stat label="Compras registradas" value={fmtNum(d.operations)} hint={`${fmtNum(d.units_issued)} sellos/puntos otorgados`} />
            <Stat label="Canjes" value={fmtNum(d.redemptions)} />
            <Stat label="Premios listos para canjear" value={fmtNum(d.rewards_ready)} hint="Clientes que ya alcanzaron un premio" />
            <Stat label="Intentos rechazados" value={fmtNum(d.rejected_attempts)} hint={d.rejected_attempts > 0 ? <Link to="/panel/auditoria">Ver detalle</Link> : 'QR inválidos, límites, etc.'} />
          </div>

          <div className="card stack">
            <div className="row-between"><h3 className="mb-0">Actividad diaria</h3>
              <Tabs value={series} onChange={setSeries} items={[{ id: 'operations', label: 'Compras' }, { id: 'redemptions', label: 'Canjes' }, { id: 'new_cards', label: 'Nuevos clientes' }]} /></div>
            <BarChart label={series} data={d.series.map((s: any) => ({ day: s.day, value: s[series] }))} />
          </div>

          <div className="grid-2">
            <div className="card stack-sm">
              <h3>Por tarjeta</h3>
              {d.programs.length === 0 && <p className="muted small">Sin tarjetas.</p>}
              {d.programs.map((p: any) => (
                <Link key={p.id} to={`/panel/tarjetas/${p.id}`} className="row-between small" style={{ color: 'inherit' }}>
                  <span><strong>{p.name}</strong> <span className="subtle">· {programType(p.type).label}</span></span>
                  <span className="muted">{p.cards} clientes · {p.operations} compras · {p.redemptions} canjes</span>
                </Link>
              ))}
            </div>
            <div className="card stack-sm">
              <h3>Por sucursal</h3>
              {d.branches.map((b: any) => <div key={b.id} className="row-between small"><strong>{b.name}</strong><span className="muted">{b.operations} compras · {b.redemptions} canjes</span></div>)}
              {d.staff.length > 0 && <><h3 className="mt-2">Por persona</h3>
                {d.staff.map((s: any, i: number) => <div key={i} className="row-between small"><span>{s.name}</span><span className="muted">{s.operations} compras · {s.redemptions} canjes</span></div>)}</>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
