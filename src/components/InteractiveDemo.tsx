import { useEffect, useMemo, useState } from 'react';
import { Gift, PartyPopper, RotateCcw, ScanLine, Sparkles } from 'lucide-react';
import { LoyaltyCard } from './LoyaltyCard';
import { Confetti } from './Motion';
import type { ProgramType } from '../lib/types';

interface Rubro {
  id: string; theme: string; label: string; emoji: string; program: string; merchant: string; type: ProgramType;
  required: number; reward: string; items: string[]; bg: string; text: string; accent: string; icon: string; hook: string;
}

const RUBROS: Rubro[] = [
  { id: 'cafe', theme: 'cafe', label: 'Cafetería', emoji: '☕', program: 'Café Frecuente', merchant: 'Café Aroma', type: 'stamps', required: 8, reward: 'Café grande gratis', items: ['Café con leche', 'Flat white', 'Cortado + medialuna', 'Capuccino'], bg: '#3B2416', text: '#FFF6EC', accent: '#F5B971', icon: 'coffee', hook: 'El cliente que viene 2 veces por semana ahora viene 3.' },
  { id: 'barber', theme: 'barber', label: 'Barbería', emoji: '💈', program: 'Barber Pass', merchant: 'Barbería Norte', type: 'visits', required: 6, reward: 'Corte gratis', items: ['Corte clásico', 'Corte + barba', 'Fade', 'Perfilado de barba'], bg: '#0E0E12', text: '#FFFFFF', accent: '#B7F000', icon: 'scissors', hook: 'Tu cliente no se va a la barbería de la otra cuadra.' },
  { id: 'burger', theme: 'burger', label: 'Hamburguesería', emoji: '🍔', program: 'Burger Points', merchant: 'Gor Burger', type: 'points', required: 100, reward: 'Combo doble gratis', items: ['Combo clásico · $14.500', 'Doble cheddar · $18.200', 'Burger veggie · $13.900', 'Pedido familiar · $42.000'], bg: '#FF5A36', text: '#1A0B06', accent: '#FFF3B0', icon: 'burger', hook: 'Cuanto más gasta, más rápido llega al premio.' },
  { id: 'helado', theme: 'icecream', label: 'Heladería', emoji: '🍦', program: 'Club del Helado', merchant: 'Heladería Polar', type: 'stamps', required: 6, reward: '1/4 kg de regalo', items: ['Cucurucho doble', '1/4 kg', '1/2 kg', 'Milkshake'], bg: '#FFD6E8', text: '#3A1028', accent: '#E0337A', icon: 'icecream', hook: 'Hasta en invierno te eligen a vos.' },
  { id: 'lavadero', theme: 'carwash', label: 'Lavadero', emoji: '🚗', program: 'Lavado Frecuente', merchant: 'Lavadero Brillo', type: 'visits', required: 5, reward: 'Lavado premium gratis', items: ['Lavado exterior', 'Lavado completo', 'Encerado', 'Interior a fondo'], bg: '#0B2E4F', text: '#EEF6FF', accent: '#22D3EE', icon: 'car', hook: 'El auto siempre vuelve al mismo lavadero.' },
  { id: 'gym', theme: 'gym', label: 'Gimnasio', emoji: '💪', program: 'Constancia', merchant: 'Gym Fuerza', type: 'visits', required: 12, reward: 'Clase personalizada', items: ['Musculación', 'Funcional', 'Spinning', 'Crossfit'], bg: '#1B1035', text: '#F5F0FF', accent: '#A78BFA', icon: 'dumbbell', hook: 'Premiás la constancia y bajás las bajas.' },
  { id: 'estetica', theme: 'beauty', label: 'Estética', emoji: '✨', program: 'Club Bienestar', merchant: 'Estética Luz', type: 'visits', required: 5, reward: 'Limpieza facial de regalo', items: ['Manicura', 'Depilación', 'Masaje', 'Tratamiento facial'], bg: '#F5EBDD', text: '#2B1D12', accent: '#C2410C', icon: 'sparkles', hook: 'Tus clientas reservan el próximo turno antes de irse.' },
  { id: 'mascotas', theme: 'pets', label: 'Mascotas', emoji: '🐾', program: 'Amigos Peludos', merchant: 'Pet Shop Huellas', type: 'stamps', required: 8, reward: 'Baño gratis para tu mascota', items: ['Bolsa de alimento', 'Snacks', 'Juguete', 'Baño y corte'], bg: '#0F3D2E', text: '#F0FFF7', accent: '#7CE0A3', icon: 'paw', hook: 'El alimento de todos los meses, siempre con vos.' },
];

const pointsOf = (item: string) => Math.floor(Number(item.split('$')[1]?.replace(/\./g, '') ?? 0) / 1000);

/** Simulación interactiva: el visitante hace de empleado y ve la tarjeta del cliente reaccionar. */
export function InteractiveDemo() {
  const [rid, setRid] = useState('cafe');
  const r = useMemo(() => RUBROS.find((x) => x.id === rid)!, [rid]);
  const [balance, setBalance] = useState(3);
  const [scanning, setScanning] = useState(false);
  const [feed, setFeed] = useState<{ id: number; text: string; plus: string }[]>([]);
  const [fire, setFire] = useState(0);
  const [redeemed, setRedeemed] = useState(0);
  const [bump, setBump] = useState(0);

  useEffect(() => { setBalance(r.type === 'points' ? 40 : Math.floor(r.required / 2)); setFeed([]); setRedeemed(0); }, [r]);

  const complete = balance >= r.required;
  const progress = Math.min(100, (balance / r.required) * 100);

  function add() {
    if (scanning || complete) return;
    setScanning(true);
    setTimeout(() => {
      const item = r.items[Math.floor(Math.random() * r.items.length)];
      const plus = r.type === 'points' ? pointsOf(item) : 1;
      setBalance((b) => Math.min(r.type === 'points' ? b + plus : r.required, b + plus));
      setFeed((f) => [{ id: Date.now(), text: item.split(' · ')[0], plus: r.type === 'points' ? `+${plus} pts` : r.type === 'visits' ? '+1 visita' : '+1 sello' }, ...f].slice(0, 4));
      setScanning(false);
      setBump((n) => n + 1);
      navigator.vibrate?.(30);
    }, 650);
  }

  function redeem() {
    setFire((n) => n + 1);
    setRedeemed((n) => n + 1);
    setFeed((f) => [{ id: Date.now(), text: `Canje: ${r.reward}`, plus: '🎁' }, ...f].slice(0, 4));
    setTimeout(() => setBalance(r.type === 'points' ? balance - r.required : 0), 900);
  }

  return (
    <div className="demo">
      <div className="demo-tabs" role="tablist" aria-label="Elegí un rubro">
        {RUBROS.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === rid} className="demo-tab" onClick={() => setRid(x.id)}
            style={x.id === rid ? { ['--tab-accent' as string]: x.accent } : undefined}>
            <span className="demo-tab-emoji" aria-hidden>{x.emoji}</span>{x.label}
          </button>
        ))}
      </div>

      <div className="demo-stage" style={{ ['--demo-accent' as string]: r.accent, ['--demo-bg' as string]: r.bg }}>
        <Confetti fire={fire} />
        <div className="demo-side">
          <span className="demo-kicker">1 · Tu empleado, en el mostrador</span>
          <h3 className="demo-title">{r.merchant}</h3>
          <p className="muted">{r.hook}</p>

          {!complete ? (
            <button className={`demo-action ${scanning ? 'busy' : ''}`} onClick={add} disabled={scanning}>
              <ScanLine size={22} />
              {scanning ? 'Escaneando QR…' : r.type === 'points' ? 'Escanear y sumar compra' : r.type === 'visits' ? 'Escanear y sumar visita' : 'Escanear y sumar sello'}
            </button>
          ) : (
            <button className="demo-action redeem" onClick={redeem}>
              <Gift size={22} /> Canjear: {r.reward}
            </button>
          )}

          <ul className="demo-feed" aria-live="polite">
            {feed.length === 0 && <li className="subtle">Tocá el botón y mirá la tarjeta del cliente →</li>}
            {feed.map((f) => <li key={f.id} className="demo-feed-item"><span>{f.text}</span><strong>{f.plus}</strong></li>)}
          </ul>

          <div className="row small muted">
            {redeemed > 0 && <span className="badge badge-lime"><PartyPopper size={12} /> {redeemed} cliente(s) feliz(es)</span>}
            <button className="btn btn-ghost btn-sm" onClick={() => { setBalance(0); setFeed([]); setRedeemed(0); }}><RotateCcw size={14} /> Reiniciar</button>
          </div>
        </div>

        <div className="demo-phone-wrap">
          <span className="demo-kicker center">2 · Lo que ve tu cliente en su celular</span>
          <div className={`phone ${bump ? 'bump' : ''}`} key={bump}>
            <div className="phone-notch" />
            <div className="phone-screen">
              <div className="phone-status"><span>9:41</span><span>●●●</span></div>
              <div className="phone-hello">Hola, Sofi 👋</div>
              <LoyaltyCard compact look={{ theme: r.theme, goal: r.required, type: r.type, name: r.program, merchantName: r.merchant, bgColor: r.bg, textColor: r.text, accentColor: r.accent, stampIcon: r.icon, stampsRequired: r.type === 'points' ? null : r.required, balance, rewardName: r.reward }} />
              <div className="phone-progress">
                <div className="row-between small"><span>{complete ? '¡Premio desbloqueado!' : `Próximo premio`}</span><strong>{balance}/{r.required}</strong></div>
                <div className="progress"><span style={{ width: `${progress}%`, background: r.accent }} /></div>
              </div>
              {complete ? (
                <div className="phone-unlocked"><Sparkles size={16} /> {r.reward}</div>
              ) : (
                <div className="phone-qr" aria-hidden>
                  {Array.from({ length: 49 }, (_, i) => <span key={i} style={{ opacity: ((i * 7 + bump * 3) % 5) > 1 ? 1 : 0 }} />)}
                </div>
              )}
              <div className="phone-foot small">QR renovado cada 30 s 🔒</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
