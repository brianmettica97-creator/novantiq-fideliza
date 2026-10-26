import { useEffect, useRef, useState } from 'react';
import { Hand, Plus, RotateCcw, Wand2 } from 'lucide-react';
import { ThemedCard, CARD_THEMES, type ThemeInfo } from './ThemedCard';
import { Confetti, Tilt } from './Motion';
import type { CardLook } from '../lib/types';

const lookFor = (t: ThemeInfo, balance: number): CardLook => ({
  type: 'stamps', theme: t.id, name: t.sample.program, merchantName: t.sample.merchant, rewardName: t.sample.reward,
  stampsRequired: t.sample.required, balance, bgColor: '', textColor: '', accentColor: '', stampIcon: 'star', code: 'K7Q9M2XP',
});

/** Vitrina principal: elegís el rubro, tocás la tarjeta y ves su animación y su festejo. */
export function ThemeShowcase() {
  const [sel, setSel] = useState<ThemeInfo>(CARD_THEMES[0]);
  const [balance, setBalance] = useState(3);
  const [fire, setFire] = useState(0);
  const req = sel.sample.required;
  const complete = balance >= req;

  useEffect(() => { setBalance(Math.floor(req / 2)); }, [sel, req]);

  function add() {
    if (complete) { setBalance(0); return; }
    const next = balance + 1;
    setBalance(next);
    navigator.vibrate?.(25);
    if (next >= req) setTimeout(() => setFire((n) => n + 1), 200);
  }

  return (
    <div className="ts">
      <Confetti fire={fire} />
      <div className="ts-list" role="tablist" aria-label="Diseños por rubro">
        {CARD_THEMES.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === sel.id} className={`ts-chip ts-chip-${t.id}`} onClick={() => setSel(t)}>
            <span className="ts-chip-emoji" aria-hidden>{t.emoji}</span>
            <span className="ts-chip-text"><strong>{t.label}</strong><small>{t.rubro}</small></span>
          </button>
        ))}
      </div>

      <div className="ts-stage">
        <div className={`ts-glow ts-glow-${sel.id}`} aria-hidden />
        <Tilt max={10} className="ts-card"><ThemedCard key={sel.id} look={lookFor(sel, balance)} onTap={add} /></Tilt>
        <p className="ts-hint"><Hand size={14} /> {complete ? 'Tocá para empezar una tarjeta nueva' : 'Tocá la tarjeta para sumar'}</p>
        <div className="row ts-controls">
          <button className="btn btn-primary" onClick={add} disabled={complete}><Plus size={16} /> Sumar</button>
          <button className="btn" onClick={() => { setBalance(req); setFire((n) => n + 1); }} disabled={complete}><Wand2 size={16} /> Completar</button>
          <button className="btn btn-ghost" onClick={() => setBalance(0)}><RotateCcw size={16} /> Reiniciar</button>
        </div>
      </div>

      <aside className="ts-info">
        <span className="ts-kicker">Inspirado en</span>
        <h3>{sel.emoji} {sel.rubro}</h3>
        <p className="muted">{sel.inspiration}</p>
        <ul className="ts-specs">
          <li><span>Al sumar</span><strong>{SPECS[sel.id][0]}</strong></li>
          <li><span>Al completar</span><strong>{SPECS[sel.id][1]}</strong></li>
          <li><span>Tipografía</span><strong>{SPECS[sel.id][2]}</strong></li>
        </ul>
        <p className="small subtle mb-0">Cada comercio usa su nombre, logo y premio. También puede elegir el diseño “Clásico” con sus propios colores.</p>
      </aside>
    </div>
  );
}

const SPECS: Record<string, [string, string, string]> = {
  cafe: ['La taza se llena de café con espuma y sale vapor', 'Brillo cálido y sello “¡Invita la casa!”', 'Fraunces, serif artesanal'],
  barber: ['Insignia dorada que gira y tijeras que cortan', 'El poste gira rápido y pasa un destello dorado', 'Playfair Display, vintage'],
  burger: ['Cae un ingrediente nuevo y rebota', 'Llega el pan con sésamo y la burger salta', 'Bungee, cartel de diner'],
  icecream: ['Una bocha cae en el cucurucho y se aplasta', 'Cereza arriba y la tarjeta se bambolea', 'Baloo 2, redondeada y dulce'],
  carwash: ['Una gota cae y el barro se va borrando', 'El auto queda brillante y destella', 'Space Grotesk, limpia y moderna'],
  gym: ['Se carga un disco en la barra y la energía sube', 'La tarjeta tiembla: ¡nuevo récord!', 'Oswald, condensada e itálica'],
  beauty: ['Un pétalo se abre en la flor', 'La flor gira con un brillo dorado', 'Fraunces itálica con dorado'],
  pets: ['Aparece una huellita en el camino', 'El hueso se mueve y suben corazones', 'Baloo 2, divertida'],
};

/** Pared de tarjetas que se llenan solas, mostrando todos los diseños vivos. */
export function ThemeWall() {
  const [tick, setTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useRef(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting; });
    if (ref.current) io.observe(ref.current);
    const t = setInterval(() => visible.current && document.visibilityState === 'visible' && setTick((n) => n + 1), 1400);
    return () => { clearInterval(t); io.disconnect(); };
  }, []);
  return (
    <div className="ts-wall" ref={ref}>
      {CARD_THEMES.map((t, i) => {
        const cycle = t.sample.required + 3; // pausa de 2 pasos con la tarjeta completa
        const pos = (tick + i * 2) % cycle;
        return (
          <figure key={t.id} className="ts-wall-item">
            <ThemedCard look={lookFor(t, Math.min(pos, t.sample.required))} />
            <figcaption><span>{t.emoji}</span> {t.rubro}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}
