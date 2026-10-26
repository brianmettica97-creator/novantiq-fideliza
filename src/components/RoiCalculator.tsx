import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { fmtMoney } from '../lib/format';

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider">
      <span className="row-between"><span>{label}</span><strong className="slider-value">{format(value)}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ['--pct' as string]: `${pct}%` }} />
    </label>
  );
}

/** Estimación ilustrativa del ingreso adicional por mayor frecuencia de compra. */
export function RoiCalculator({ planPrice = 29900 }: { planPrice?: number }) {
  const [customers, setCustomers] = useState(400);
  const [ticket, setTicket] = useState(6000);
  const [lift, setLift] = useState(15);
  const extra = Math.round(customers * ticket * (lift / 100));
  const visitsToPay = Math.ceil(planPrice / ticket);
  return (
    <div className="roi">
      <div className="stack">
        <Slider label="Clientes por mes" value={customers} min={50} max={3000} step={50} onChange={setCustomers} format={(v) => v.toLocaleString('es-AR')} />
        <Slider label="Ticket promedio" value={ticket} min={1000} max={50000} step={500} onChange={setTicket} format={fmtMoney} />
        <Slider label="Visitas extra gracias al programa" value={lift} min={5} max={40} step={1} onChange={setLift} format={(v) => `+${v}%`} />
      </div>
      <div className="roi-result">
        <TrendingUp size={26} />
        <span className="muted">Podrías facturar por mes</span>
        <span className="roi-number gradient-text" key={extra}>+{fmtMoney(extra)}</span>
        <span className="small muted">El plan Profesional se paga con solo <strong className="lime">{visitsToPay} visitas extra</strong> al mes.</span>
        <span className="small subtle">Estimación ilustrativa: el resultado real depende de tu negocio.</span>
      </div>
    </div>
  );
}
