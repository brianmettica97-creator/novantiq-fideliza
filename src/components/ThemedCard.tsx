import { useEffect, useId, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { Scissors } from 'lucide-react';
import type { CardLook } from '../lib/types';
import { initials } from '../lib/format';
import { formatCardCode } from '../lib/qr';

export type ThemeId = 'classic' | 'cafe' | 'barber' | 'burger' | 'icecream' | 'carwash' | 'gym' | 'beauty' | 'pets';

export interface ThemeInfo {
  id: ThemeId; label: string; emoji: string; rubro: string; inspiration: string; done: string;
  sample: { merchant: string; program: string; reward: string; required: number };
}

export const CARD_THEMES: ThemeInfo[] = [
  { id: 'cafe', label: 'Barista', emoji: '☕', rubro: 'Cafetería · Panadería', inspiration: 'Tazas que se llenan de café con espuma y vapor, papel kraft y granos tostados.', done: '☕ ¡Invita la casa!', sample: { merchant: 'Café Aroma', program: 'Café Frecuente', reward: 'Café grande gratis', required: 8 } },
  { id: 'barber', label: 'Old School', emoji: '💈', rubro: 'Barbería · Peluquería', inspiration: 'Poste giratorio clásico, negro y oro, insignias vintage y tijeras que cortan.', done: '✂ Corte gratis', sample: { merchant: 'Barbería Norte', program: 'Barber Pass', reward: 'Corte + barba gratis', required: 6 } },
  { id: 'burger', label: 'Diner', emoji: '🍔', rubro: 'Hamburguesería · Comidas', inspiration: 'Cada compra suma un ingrediente: la hamburguesa se arma capa por capa.', done: '¡Combo listo!', sample: { merchant: 'Gor Burger', program: 'Burger Club', reward: 'Combo doble gratis', required: 6 } },
  { id: 'icecream', label: 'Gelato', emoji: '🍦', rubro: 'Heladería', inspiration: 'Colores pastel, chocolate que chorrea y bochas de sabores que caen en el cucurucho.', done: '🍒 ¡Con cereza!', sample: { merchant: 'Heladería Polar', program: 'Club del Helado', reward: '1/4 kg de regalo', required: 6 } },
  { id: 'carwash', label: 'Splash', emoji: '🚗', rubro: 'Lavadero de autos', inspiration: 'Olas y burbujas: el auto pasa de embarrado a brillante con cada lavado.', done: '✨ ¡Impecable!', sample: { merchant: 'Lavadero Brillo', program: 'Lavado Frecuente', reward: 'Lavado premium gratis', required: 5 } },
  { id: 'gym', label: 'Power', emoji: '💪', rubro: 'Gimnasio · Deportes', inspiration: 'Neón, tipografía condensada y una barra que se carga de discos con cada clase.', done: '💥 ¡Nuevo récord!', sample: { merchant: 'Gym Fuerza', program: 'Constancia', reward: 'Clase personalizada', required: 8 } },
  { id: 'beauty', label: 'Glow', emoji: '🌸', rubro: 'Estética · Spa · Uñas', inspiration: 'Mármol, dorado y una flor que abre un pétalo con cada visita.', done: '✨ Te lo merecés', sample: { merchant: 'Estética Luz', program: 'Club Bienestar', reward: 'Limpieza facial de regalo', required: 6 } },
  { id: 'pets', label: 'Huellitas', emoji: '🐾', rubro: 'Pet shop · Veterinaria', inspiration: 'Huellas que caminan por el pasto hasta llegar al hueso de premio.', done: '🦴 ¡Premio para tu peludo!', sample: { merchant: 'Pet Shop Huellas', program: 'Amigos Peludos', reward: 'Baño gratis', required: 7 } },
];

export const CLASSIC_THEME = { id: 'classic' as const, label: 'Clásica', emoji: '🎨', rubro: 'Cualquier rubro', inspiration: 'Tus colores de marca y el ícono que elijas.' };

const BY_CATEGORY: Record<string, ThemeId> = {
  cafeteria: 'cafe', panaderia: 'cafe', restaurante: 'burger', hamburgueseria: 'burger', heladeria: 'icecream',
  lavadero: 'carwash', peluqueria: 'barber', barberia: 'barber', estetica: 'beauty', gimnasio: 'gym', mascotas: 'pets',
};
export const themeForCategory = (cat: string): ThemeId => BY_CATEGORY[cat] ?? 'classic';
export const themeInfo = (id: string) => CARD_THEMES.find((t) => t.id === id);

const sid = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '');

// -----------------------------------------------------------------------------
// Visuales por rubro. Reciben cuántos casilleros hay, cuántos llenos y cuál es nuevo.
// -----------------------------------------------------------------------------
interface V { slots: number; filled: number; fresh: number | null; complete: boolean; ratio: number }

function Cup({ full, fresh, id }: { full: boolean; fresh: boolean; id: string }) {
  const body = 'M9 14h22l-2.6 19.5a4.5 4.5 0 0 1-4.5 3.9h-7.8a4.5 4.5 0 0 1-4.5-3.9z';
  return (
    <svg viewBox="0 0 44 44" className={`cup ${full ? 'full' : ''} ${fresh ? 'fresh' : ''}`} aria-hidden>
      <defs><clipPath id={id}><path d={body} /></clipPath></defs>
      <g className="steam"><path d="M15 11c-2.5-2.5 2.5-3.5 0-6" /><path d="M20 11c-2.5-2.5 2.5-3.5 0-6" /><path d="M25 11c-2.5-2.5 2.5-3.5 0-6" /></g>
      <g clipPath={`url(#${id})`}><rect className="cup-liquid" x="7" y="14" width="26" height="24" /><ellipse className="cup-foam" cx="20" cy="15.5" rx="12" ry="2.6" /></g>
      <path className="cup-body" d={body} />
      <path className="cup-handle" d="M31 18h2.5a4.5 4.5 0 0 1 0 9H30" />
      <path className="cup-saucer" d="M5 39.5h30" />
    </svg>
  );
}

function CafeVisual({ slots, filled, fresh }: V) {
  const base = sid(useId());
  const cols = slots <= 5 ? slots : Math.ceil(slots / 2);
  return (
    <div className="v-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: slots }, (_, i) => <Cup key={i} id={`${base}c${i}`} full={i < filled} fresh={i === fresh} />)}
    </div>
  );
}

function BarberVisual({ slots, filled, fresh }: V) {
  const cols = slots <= 5 ? slots : Math.ceil(slots / 2);
  return (
    <div className="v-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: slots }, (_, i) => (
        <div key={i} className={`bb ${i < filled ? 'full' : ''} ${i === fresh ? 'fresh' : ''}`}>
          {i < filled ? <Scissors className="snip" strokeWidth={2.2} /> : <span>{String(i + 1).padStart(2, '0')}</span>}
        </div>
      ))}
    </div>
  );
}

const BURGER_LAYERS = ['patty', 'cheese', 'lettuce', 'tomato', 'patty', 'onion', 'cheese', 'lettuce', 'patty', 'tomato'];
function BurgerVisual({ slots, filled, fresh, complete }: V) {
  return (
    <div className="burger-row">
      <div className="burger" style={{ ['--lh' as string]: `${Math.min(5.2, 28 / (slots + 3.5))}cqw` } as CSSProperties}>
        {complete && <span className="b-layer bun-top fresh-drop" />}
        {Array.from({ length: filled }, (_, i) => filled - 1 - i).map((i) => (
          <span key={i} className={`b-layer ${BURGER_LAYERS[i % BURGER_LAYERS.length]} ${i === fresh ? 'fresh-drop' : ''}`} />
        ))}
        <span className="b-layer bun-bottom" />
      </div>
      <div className="burger-count"><strong>{filled}</strong><span>/{slots}</span><small>ingredientes</small></div>
    </div>
  );
}

const FLAVORS = ['#9EE6C4', '#FF8FB1', '#8B5A3C', '#FFF2C6', '#A6B8FF', '#FFE45C', '#C79BFF', '#FFB38A'];
function IcecreamVisual({ slots, filled, fresh, complete }: V) {
  return (
    <div className="cones" style={{ gridTemplateColumns: `repeat(${slots <= 6 ? slots : Math.ceil(slots / 2)}, 1fr)` }}>
      {Array.from({ length: slots }, (_, i) => (
        <div key={i} className={`cone-wrap ${i < filled ? 'full' : ''} ${i === fresh ? 'fresh' : ''}`} style={{ ['--flavor' as string]: FLAVORS[i % FLAVORS.length] } as CSSProperties}>
          {complete && i === slots - 1 && <span className="cherry" />}
          <span className="scoop" />
          <span className="cone" />
        </div>
      ))}
    </div>
  );
}

function CarwashVisual({ slots, filled, fresh, ratio, complete }: V) {
  return (
    <div className="wash">
      <svg viewBox="0 0 130 52" className={`car ${complete ? 'clean' : ''}`} aria-hidden>
        <path className="car-body" d="M8 36c0-5 3-8 8-9l15-3 13-11c2-2 5-3 8-3h27c4 0 7 2 9 5l8 9 15 2c5 1 8 4 8 9v5H8z" />
        <path className="car-window" d="M47 23l10-9c1-1 2-1.4 4-1.4h11v10.4zM76 12.6h8c2 0 4 1 5 3l6 7.4H76z" />
        <g className="mud" style={{ opacity: Math.max(0, 1 - ratio) }}>
          <circle cx="22" cy="37" r="4" /><circle cx="40" cy="31" r="3" /><circle cx="63" cy="34" r="5" /><circle cx="86" cy="30" r="3.5" /><circle cx="110" cy="36" r="4.5" /><circle cx="72" cy="24" r="2.5" />
        </g>
        <circle className="wheel" cx="34" cy="42" r="8.5" /><circle className="hub" cx="34" cy="42" r="3.2" />
        <circle className="wheel" cx="102" cy="42" r="8.5" /><circle className="hub" cx="102" cy="42" r="3.2" />
        <g className="shine"><path d="M30 8l1.6 4 4 1.6-4 1.6L30 19l-1.6-3.8-4-1.6 4-1.6z" /><path d="M118 14l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" /><path d="M96 2l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" /></g>
      </svg>
      <div className="drops">
        {Array.from({ length: slots }, (_, i) => (
          <svg key={i} viewBox="0 0 24 28" className={`drop ${i < filled ? 'full' : ''} ${i === fresh ? 'fresh' : ''}`} aria-hidden><path d="M12 2S4 11 4 17a8 8 0 0 0 16 0c0-6-8-15-8-15z" /></svg>
        ))}
      </div>
    </div>
  );
}

const PLATE_COLORS = ['#FF3B5C', '#2F80ED', '#FFC93C', '#27AE60', '#B7F000'];
function GymVisual({ slots, filled, fresh }: V) {
  const perSide = Math.ceil(slots / 2);
  const side = (left: boolean) => Array.from({ length: perSide }, (_, k) => {
    const i = k * 2 + (left ? 0 : 1);
    if (i >= slots) return null;
    return <span key={i} className={`plate ${i < filled ? 'full' : ''} ${i === fresh ? 'fresh' : ''} ${left ? 'l' : 'r'}`}
      style={{ ['--ph' as string]: `${100 - k * (40 / perSide)}%`, ['--pc' as string]: PLATE_COLORS[k % PLATE_COLORS.length] } as CSSProperties} />;
  });
  return (
    <div className="gym">
      <div className="barbell">
        <span className="bar-end" />
        <div className="plates left">{side(true)}</div>
        <span className="bar-grip" />
        <div className="plates right">{side(false)}</div>
        <span className="bar-end" />
      </div>
      <div className="energy">{Array.from({ length: slots }, (_, i) => <span key={i} className={i < filled ? 'on' : ''} />)}</div>
    </div>
  );
}

function BeautyVisual({ slots, filled, fresh }: V) {
  const g = sid(useId());
  return (
    <div className="bloom-row">
      <svg viewBox="0 0 100 100" className="flower" aria-hidden>
        <defs>
          <linearGradient id={`${g}p`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F7C6C7" /><stop offset="1" stopColor="#D98E95" /></linearGradient>
          <radialGradient id={`${g}c`}><stop offset="0" stopColor="#FFF3C4" /><stop offset="1" stopColor="#C9A14A" /></radialGradient>
        </defs>
        {Array.from({ length: slots }, (_, i) => (
          <g key={i} transform={`rotate(${(i * 360) / slots} 50 50)`}>
            <path className={`petal ${i < filled ? 'full' : ''} ${i === fresh ? 'fresh' : ''}`} fill={i < filled ? `url(#${g}p)` : 'none'} d="M50 48C40 36 41 16 50 7c9 9 10 29 0 41z" />
          </g>
        ))}
        <circle cx="50" cy="50" r="9" fill={`url(#${g}c)`} className="flower-core" />
      </svg>
      <div className="bloom-text"><em>{filled} de {slots}</em><span>pétalos abiertos</span></div>
    </div>
  );
}

function PawIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden><ellipse cx="16" cy="21" rx="7" ry="6" /><ellipse cx="7.5" cy="13" rx="3" ry="4" /><ellipse cx="13" cy="8" rx="3" ry="4" /><ellipse cx="19" cy="8" rx="3" ry="4" /><ellipse cx="24.5" cy="13" rx="3" ry="4" /></svg>;
}
function PetsVisual({ slots, filled, fresh, complete }: V) {
  return (
    <div className="trail">
      {Array.from({ length: slots }, (_, i) => {
        const x = 4 + (i * 74) / Math.max(1, slots - 1);
        const y = 50 + (i % 2 ? -18 : 14) + Math.sin(i / 1.3) * 6;
        return <span key={i} className={`paw ${i < filled ? 'full' : ''} ${i === fresh ? 'fresh' : ''}`} style={{ left: `${x}%`, top: `${y}%`, rotate: `${80 + (i % 2 ? -12 : 12)}deg` }}><PawIcon /></span>;
      })}
      <span className={`bone ${complete ? 'happy' : ''}`}>🦴</span>
    </div>
  );
}

const VISUALS: Record<Exclude<ThemeId, 'classic'>, (v: V) => ReactElement> = {
  cafe: CafeVisual, barber: BarberVisual, burger: BurgerVisual, icecream: IcecreamVisual,
  carwash: CarwashVisual, gym: GymVisual, beauty: BeautyVisual, pets: PetsVisual,
};

function Backdrop({ theme }: { theme: ThemeId }) {
  switch (theme) {
    case 'barber': return <span className="pole" aria-hidden />;
    case 'burger': return <span className="checker" aria-hidden />;
    case 'icecream': return (
      <svg className="drips" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden>
        <path d="M0 0h400v14c-10 0-12 18-22 18s-10-12-20-12-9 22-21 22-11-20-22-20-10 9-20 9-12-15-24-15-11 24-23 24-10-17-21-17-9 8-20 8-12-13-22-13-11 19-22 19-10-11-21-11-11 15-22 15-10-20-21-20-12 12-22 12-9-9-21-9-11 17-22 17-11-14-22-14-10 10-22 10-10-8-20-8V0z" />
      </svg>
    );
    case 'carwash': return (
      <>
        <span className="bubbles" aria-hidden>{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</span>
        <svg className="waves" viewBox="0 0 800 60" preserveAspectRatio="none" aria-hidden>
          <path className="w1" d="M0 30 Q 50 10 100 30 T 200 30 T 300 30 T 400 30 T 500 30 T 600 30 T 700 30 T 800 30 V60 H0z" />
          <path className="w2" d="M0 38 Q 50 22 100 38 T 200 38 T 300 38 T 400 38 T 500 38 T 600 38 T 700 38 T 800 38 V60 H0z" />
        </svg>
      </>
    );
    case 'beauty': return <span className="sparkles" aria-hidden>{Array.from({ length: 6 }, (_, i) => <i key={i}>✦</i>)}</span>;
    case 'pets': return <span className="grass" aria-hidden />;
    case 'gym': return <span className="neon-grid" aria-hidden />;
    default: return null;
  }
}

/**
 * Tarjeta con diseño temático por rubro. Anima el casillero nuevo cuando sube el saldo
 * y lanza un festejo propio de cada tema al completarse.
 */
export function ThemedCard({ look, onTap, celebrateKey }: { look: CardLook; onTap?: () => void; celebrateKey?: number }) {
  const theme = (look.theme ?? 'classic') as Exclude<ThemeId, 'classic'>;
  const info = themeInfo(theme)!;
  const isPoints = look.type === 'points';
  const required = Math.max(1, (isPoints ? look.goal : look.stampsRequired) ?? (isPoints ? 100 : 8));
  // Puntos: 8 casilleros proporcionales a la meta. Sellos: uno por sello (máx. 12; si hay más, se escala).
  const slots = isPoints ? 8 : Math.min(required, 12);
  const inCycle = isPoints ? Math.min(look.balance, required) : look.balance >= required ? required : look.balance % required;
  const filled = Math.min(slots, Math.floor((inCycle / required) * slots + 1e-9));
  const complete = filled >= slots;

  const prev = useRef(filled);
  const [fresh, setFresh] = useState<number | null>(null);
  const [party, setParty] = useState(false);
  useEffect(() => {
    if (filled > prev.current) {
      setFresh(filled - 1);
      const t = setTimeout(() => setFresh(null), 1100);
      if (filled >= slots) { setParty(true); setTimeout(() => setParty(false), 1800); }
      prev.current = filled;
      return () => clearTimeout(t);
    }
    prev.current = filled;
  }, [filled, slots]);
  useEffect(() => {
    if (!celebrateKey) return;
    setParty(true);
    const t = setTimeout(() => setParty(false), 1800);
    return () => clearTimeout(t);
  }, [celebrateKey]);

  const Visual = VISUALS[theme];
  const counter = isPoints ? `${look.balance.toLocaleString('es-AR')} pts` : `${filled}/${slots}`;

  return (
    <div className="tc-wrap">
    <div className={`tc tc-${theme} ${complete ? 'complete' : ''} ${party ? 'party' : ''} ${onTap ? 'tappable' : ''}`}
      onClick={onTap} role={onTap ? 'button' : undefined} tabIndex={onTap ? 0 : undefined}
      onKeyDown={onTap ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onTap()) : undefined}
      aria-label={`Tarjeta ${look.name} de ${look.merchantName}: ${counter}`}>
      <Backdrop theme={theme} />
      <div className="tc-head">
        <div className="tc-logo">{look.logoUrl ? <img src={look.logoUrl} alt="" /> : <span>{initials(look.merchantName)}</span>}</div>
        <div className="tc-titles">
          <div className="tc-merchant">{look.merchantName}</div>
          <div className="tc-name">{look.name}</div>
        </div>
        <div className="tc-counter">{counter}</div>
      </div>
      <div className="tc-visual"><Visual slots={slots} filled={filled} fresh={fresh} complete={complete} ratio={filled / slots} /></div>
      <div className="tc-foot">
        <span className="tc-reward">{look.rewardName ? `🎁 ${look.rewardName}` : ''}</span>
        {look.code && <span className="tc-code">{formatCardCode(look.code)}</span>}
      </div>
      {complete && <div className="tc-done">{info.done}</div>}
    </div>
    </div>
  );
}
