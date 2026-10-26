import { useMemo, useState } from 'react';
import { Gift, RotateCcw, Sparkles, TicketPercent, Undo2 } from 'lucide-react';
import { Confetti } from './Motion';
import { fmtMoney } from '../lib/format';

const MENU = [
  { id: 'espresso', name: 'Espresso', emoji: '☕', price: 2800 },
  { id: 'cortado', name: 'Cortado', emoji: '🥛', price: 3200 },
  { id: 'conleche', name: 'Café con leche', emoji: '☕', price: 3600 },
  { id: 'capu', name: 'Capuccino', emoji: '🍫', price: 4200 },
  { id: 'latte', name: 'Latte', emoji: '🤍', price: 4400 },
  { id: 'flat', name: 'Flat white', emoji: '🌀', price: 4600 },
  { id: 'iced', name: 'Iced coffee', emoji: '🧊', price: 4800 },
  { id: 'combo', name: 'Café + medialuna', emoji: '🥐', price: 5200 },
];

interface Reward { id: string; label: string; short: string; emoji: string; desc: string; cost: (avg: number) => number; terms: string; color: string }

const REWARDS: Reward[] = [
  { id: 'free', label: 'Café gratis', short: 'GRATIS', emoji: '🎁', desc: 'Un café de regalo, el que elija.', cost: (a) => a, terms: 'Válido por un café mediano.', color: '#B7F000' },
  { id: '2x1', label: '2x1', short: '2x1', emoji: '👯', desc: 'Lleva dos y paga uno: ideal para venir acompañado.', cost: (a) => a, terms: 'Válido para dos cafés iguales.', color: '#22D3EE' },
  { id: '25', label: '25% OFF', short: '25% OFF', emoji: '🏷️', desc: '25% de descuento en su próxima compra.', cost: (a) => a * 0.25, terms: 'Sobre el total del ticket. Tope $10.000.', color: '#FF4D8D' },
  { id: 'medialuna', label: 'Medialuna de regalo', short: '+🥐', emoji: '🥐', desc: 'Una medialuna con su próximo café.', cost: () => 1500, terms: 'Con la compra de cualquier café.', color: '#FFC83D' },
  { id: 'upgrade', label: 'Upgrade de tamaño', short: 'XL', emoji: '⬆️', desc: 'Su café pasa a tamaño grande sin cargo.', cost: () => 900, terms: 'De mediano a grande.', color: '#A78BFA' },
];

/** Constructor interactivo de una tarjeta de cafetería: elegís productos, premio y sellos. */
export function CoffeeBuilder() {
  const [required, setRequired] = useState(8);
  const [rewardId, setRewardId] = useState('free');
  const [stamps, setStamps] = useState<typeof MENU>([MENU[2], MENU[3], MENU[0]]);
  const [fire, setFire] = useState(0);
  const [redeemed, setRedeemed] = useState(false);
  const [lastAdded, setLastAdded] = useState<number | null>(null);

  const reward = REWARDS.find((r) => r.id === rewardId)!;
  const complete = stamps.length >= required;
  const spent = stamps.reduce((s, m) => s + m.price, 0);
  const avg = useMemo(() => MENU.reduce((s, m) => s + m.price, 0) / MENU.length, []);
  const benefitCost = reward.cost(avg);
  const effective = (benefitCost / (avg * required)) * 100;
  const code = useMemo(() => `CAFE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, [fire]); // eslint-disable-line react-hooks/exhaustive-deps

  function add(item: (typeof MENU)[number]) {
    if (complete) return;
    const next = [...stamps, item];
    setStamps(next);
    setLastAdded(next.length - 1);
    navigator.vibrate?.(25);
    if (next.length >= required) setTimeout(() => setFire((n) => n + 1), 250);
  }
  function reset() { setStamps([]); setRedeemed(false); setLastAdded(null); }
  function changeRequired(n: number) {
    setRequired(n);
    setRedeemed(false);
    if (stamps.length > n) setStamps(stamps.slice(0, n));
  }

  const cols = required <= 5 ? 5 : required === 8 ? 4 : 5;

  return (
    <div className="cb">
      <Confetti fire={fire} />
      {/* 1. Menú */}
      <div className="cb-col">
        <div className="cb-step"><span>1</span> Tocá lo que pide tu cliente</div>
        <div className="cb-menu">
          {MENU.map((m) => (
            <button key={m.id} className="cb-item" onClick={() => add(m)} disabled={complete}>
              <span className="cb-item-emoji">{m.emoji}</span>
              <span className="cb-item-name">{m.name}</span>
              <span className="cb-item-price">{fmtMoney(m.price)}</span>
              <span className="cb-item-plus">+1</span>
            </button>
          ))}
        </div>
        <div className="cb-ticket">
          <div className="row-between small"><span className="muted">Compras acumuladas</span><strong>{stamps.length} · {fmtMoney(spent)}</strong></div>
          <div className="cb-ticket-list">
            {stamps.length === 0 ? <span className="subtle small">Todavía no hay compras.</span> : stamps.slice(-4).reverse().map((s, i) => <span key={`${s.id}-${stamps.length - i}`} className="cb-ticket-line">{s.emoji} {s.name}</span>)}
          </div>
          <div className="row">
            <button className="btn btn-ghost btn-sm" onClick={() => { setStamps(stamps.slice(0, -1)); setRedeemed(false); }} disabled={!stamps.length}><Undo2 size={14} /> Deshacer</button>
            <button className="btn btn-ghost btn-sm" onClick={reset}><RotateCcw size={14} /> Empezar de nuevo</button>
          </div>
        </div>
      </div>

      {/* 2. Tarjeta */}
      <div className="cb-col cb-center">
        <div className="cb-step"><span>2</span> Así la ve tu cliente</div>
        <div className={`cb-card ${complete ? 'done' : ''}`} style={{ ['--rw' as string]: reward.color }}>
          <div className="cb-card-head">
            <div className="cb-logo">☕</div>
            <div className="grow"><div className="cb-merchant">CAFÉ AROMA</div><div className="cb-title">Café Frecuente</div></div>
            <div className="cb-badge">{reward.short}</div>
          </div>
          <div className="cb-stamps" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: required }, (_, i) => {
              const s = stamps[i];
              return (
                <div key={i} className={`cb-stamp ${s ? 'on' : ''} ${i === lastAdded ? 'new' : ''} ${i === required - 1 ? 'last' : ''}`}>
                  {s ? s.emoji : i === required - 1 ? reward.emoji : <span>{i + 1}</span>}
                </div>
              );
            })}
          </div>
          <div className="cb-card-foot">
            <span>{complete ? '¡Tarjeta completa!' : `Te faltan ${required - stamps.length} para tu premio`}</span>
            <strong>{stamps.length}/{required}</strong>
          </div>
          <div className="progress cb-progress"><span style={{ width: `${(stamps.length / required) * 100}%`, background: reward.color }} /></div>
        </div>

        {complete && (
          <div className={`cb-coupon ${redeemed ? 'used' : ''}`} style={{ ['--rw' as string]: reward.color }}>
            <div className="cb-coupon-left">{reward.emoji}</div>
            <div className="cb-coupon-body">
              <div className="cb-coupon-k">{redeemed ? 'Canjeado ✓' : 'Premio desbloqueado'}</div>
              <div className="cb-coupon-t">{reward.label}</div>
              <div className="small">{reward.terms}</div>
              <div className="mono small cb-coupon-code">{code}</div>
            </div>
            {!redeemed
              ? <button className="cb-redeem" onClick={() => { setRedeemed(true); setFire((n) => n + 1); }}><Gift size={16} /> Canjear</button>
              : <button className="cb-redeem alt" onClick={reset}><RotateCcw size={16} /> Nueva tarjeta</button>}
          </div>
        )}
      </div>

      {/* 3. Configuración del premio */}
      <div className="cb-col">
        <div className="cb-step"><span>3</span> Elegí el premio</div>
        <div className="cb-rewards">
          {REWARDS.map((r) => (
            <button key={r.id} className="cb-reward" aria-pressed={r.id === rewardId} onClick={() => setRewardId(r.id)} style={{ ['--rw' as string]: r.color }}>
              <span className="cb-reward-emoji">{r.emoji}</span>
              <span className="grow"><strong>{r.label}</strong><span className="small muted">{r.desc}</span></span>
            </button>
          ))}
        </div>
        <div className="cb-step mt-2"><span>4</span> ¿Cada cuántas compras?</div>
        <div className="cb-seg" role="radiogroup" aria-label="Sellos necesarios">
          {[5, 8, 10].map((n) => <button key={n} role="radio" aria-checked={required === n} onClick={() => changeRequired(n)}>{n} sellos</button>)}
        </div>
        <div className="cb-insight">
          <TicketPercent size={18} />
          <div>
            <strong>Te cuesta ~{effective.toFixed(1).replace('.', ',')}% de lo vendido</strong>
            <span className="small muted"> · {fmtMoney(benefitCost)} de beneficio cada {fmtMoney(avg * required)} en compras. </span>
            <span className="small" style={{ color: reward.color }}><Sparkles size={12} style={{ display: 'inline' }} /> Y tu cliente vuelve {required} veces.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
