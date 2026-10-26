import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Building2, Check, Coffee, Gift, MousePointerClick, QrCode, ShieldCheck, Smartphone, Sparkles, Store, Users, Zap } from 'lucide-react';
import { LoyaltyCard } from '../../components/LoyaltyCard';
import { InteractiveDemo } from '../../components/InteractiveDemo';
import { CoffeeBuilder } from '../../components/CoffeeBuilder';
import { ThemeShowcase, ThemeWall } from '../../components/ThemeShowcase';
import { RoiCalculator } from '../../components/RoiCalculator';
import { CountUp, Reveal, RotatingWord, Tilt } from '../../components/Motion';
import { Alert, Button, Input, Textarea } from '../../components/ui';
import { errorMessage, q, rpc } from '../../lib/api';
import { CATEGORIES } from '../../lib/constants';
import { fmtMoney } from '../../lib/format';
import { isConfigured, supabase } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import type { Plan } from '../../lib/types';
import { PlanFeatures } from '../panel/Management';

// Precios de referencia si la base todavía no está conectada (deben coincidir con la migración).
const FALLBACK_PLANS: Plan[] = [
  { id: 'inicial', name: 'Inicial', description: 'Para empezar: una sucursal y una tarjeta de sellos.', price_ars: 14900, max_branches: 1, max_staff: 3, max_programs: 1, max_cards: 500, features: {}, sort_order: 1, is_public: true, active: true },
  { id: 'profesional', name: 'Profesional', description: 'Más programas, puntos, promociones y exportación.', price_ars: 29900, max_branches: 3, max_staff: 10, max_programs: 5, max_cards: 5000, features: { points: true, milestones: true, promotions: true, export: true }, sort_order: 2, is_public: true, active: true },
  { id: 'multisucursal', name: 'Multisucursal', description: 'Cadenas y comercios con varios locales.', price_ars: 59900, max_branches: 20, max_staff: 60, max_programs: 20, max_cards: null, features: { points: true, milestones: true, promotions: true, export: true }, sort_order: 3, is_public: true, active: true },
];

const HERO_CARDS = [
  { type: 'stamps' as const, theme: 'cafe', name: 'Café Frecuente', merchantName: 'Café Aroma', bgColor: '', textColor: '', accentColor: '', stampIcon: 'coffee', stampsRequired: 8, balance: 6, rewardName: 'Café grande gratis', code: 'K7Q9M2XP' },
  { type: 'stamps' as const, theme: 'barber', name: 'Barber Pass', merchantName: 'Barbería Norte', bgColor: '', textColor: '', accentColor: '', stampIcon: 'scissors', stampsRequired: 6, balance: 4, rewardName: 'Corte gratis' },
  { type: 'stamps' as const, theme: 'icecream', name: 'Club del Helado', merchantName: 'Heladería Polar', bgColor: '', textColor: '', accentColor: '', stampIcon: 'icecream', stampsRequired: 6, balance: 4, rewardName: '1/4 kg de regalo' },
];

const FAQ = [
  ['¿Mis clientes tienen que descargar una aplicación?', 'No. La tarjeta funciona desde el navegador del celular. Escanean el QR del mostrador, ingresan su correo y listo. Pueden agregarla a la pantalla de inicio.'],
  ['¿Cómo evito que alguien sume sellos sin comprar?', 'Los sellos solo los registra tu equipo, con su usuario. El QR del cliente cambia cada 30 segundos, así que una captura de pantalla no sirve. Además podés limitar operaciones por día, tiempo entre compras, y todo queda auditado.'],
  ['¿Necesito conocimientos técnicos?', 'No. Un asistente te guía en 6 pasos: datos del negocio, tipo de tarjeta, recompensa, diseño, publicación y materiales para compartir.'],
  ['¿Puedo tener varias sucursales y empleados?', 'Sí. Invitás a tu equipo por correo, cada uno con su rol (administrador, encargado, empleado) y sus sucursales habilitadas. Nadie comparte contraseñas.'],
  ['¿Qué pasa si cambio las reglas de mi tarjeta?', 'Se crea una nueva versión. Los sellos y puntos que tus clientes ya tienen se conservan, y el historial muestra con qué reglas se registró cada movimiento.'],
  ['¿Cómo se paga la suscripción?', 'Mensualmente con Mercado Pago (tarjeta de crédito, débito o dinero en cuenta). Podés cancelar cuando quieras. Los primeros 14 días son gratis.'],
  ['¿De quién son los datos de mis clientes?', 'Tus clientes te comparten sus datos solo a vos. No los vendemos ni los compartimos con otros comercios. Ver nuestra política de privacidad.'],
];

export function LandingPage() {
  const { data: plans } = useAsync(async () => (isConfigured ? q<Plan[]>(supabase.from('plans').select('*').eq('active', true).eq('is_public', true).order('sort_order')) : FALLBACK_PLANS), []);
  const list = plans?.length ? plans : FALLBACK_PLANS;
  return (
    <>
      {/* HERO */}
      <section className="hero hero-v2">
        <div className="hero-aurora" aria-hidden><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /></div>
        <div className="hero-grid-bg" aria-hidden />
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow pulse"><Sparkles size={14} /> Nuevo · Fidelización digital sin apps</span>
            <h1>Hacé que vuelvan<br />a tu <RotatingWord words={['cafetería', 'barbería', 'hamburguesería', 'heladería', 'gimnasio', 'pet shop', 'lavadero', 'local']} /></h1>
            <p className="hero-sub">Tarjetas de sellos, visitas y puntos en el celular de tus clientes. Se suman con un QR, vos premiás la fidelidad y ellos <strong>vuelven más seguido</strong>.</p>
            <div className="row mt-2">
              <Link to="/registro" className="btn btn-primary btn-lg btn-glow">Probar 14 días gratis <ArrowRight size={18} /></Link>
              <a href="#arma-tu-tarjeta" className="btn btn-lg btn-outline-glow"><MousePointerClick size={18} /> Armá tu tarjeta</a>
            </div>
            <div className="hero-trust">
              <span><Check size={14} /> Sin tarjeta de crédito</span>
              <span><Check size={14} /> Listo en 10 minutos</span>
              <span><Check size={14} /> Cancelás cuando quieras</span>
            </div>
          </div>
          <div className="hero-cards" aria-hidden>
            {HERO_CARDS.map((c, i) => (
              <div key={c.name} className={`hero-card hc${i + 1}`}>
                <Tilt max={16}><LoyaltyCard compact look={c} /></Tilt>
              </div>
            ))}
            <div className="floating-chip chip-a"><Gift size={14} /> ¡Premio desbloqueado!</div>
            <div className="floating-chip chip-b"><QrCode size={14} /> +1 sello</div>
          </div>
        </div>
      </section>

      {/* DISEÑOS POR RUBRO */}
      <section className="section" id="disenos">
        <div className="container">
          <Reveal className="section-head center-head">
            <span className="eyebrow"><Sparkles size={14} /> Diseños por rubro</span>
            <h2>Una tarjeta con <span className="gradient-text">el ADN de tu negocio</span></h2>
            <p className="muted">Cada rubro tiene su propio diseño, su animación al sumar y su festejo al completarla. Elegí uno y tocá la tarjeta.</p>
          </Reveal>
          <Reveal><ThemeShowcase /></Reveal>
          <Reveal><ThemeWall /></Reveal>
        </div>
      </section>

      {/* CONSTRUCTOR DE TARJETA DE CAFÉ */}
      <section className="section cb-section" id="arma-tu-tarjeta">
        <div className="container">
          <Reveal className="section-head center-head">
            <span className="eyebrow"><Coffee size={14} /> Ejemplo: cafetería</span>
            <h2>Armá tu tarjeta <span className="gradient-text">en 10 segundos</span></h2>
            <p className="muted">Sumá cafés hasta completarla y probá distintos premios: café gratis, 2x1, 25% OFF y más. Vos decidís cuánto regalar.</p>
          </Reveal>
          <Reveal><CoffeeBuilder /></Reveal>
        </div>
      </section>

      {/* MARQUEE DE RUBROS */}
      <div className="marquee" aria-label="Rubros compatibles">
        <div className="marquee-track">
          {[...CATEGORIES, ...CATEGORIES].filter((c) => c.id !== 'otro').map((c, i) => <span key={i} className="marquee-item"><Store size={16} />{c.label}</span>)}
        </div>
      </div>

      {/* NÚMEROS */}
      <section className="container stats-strip">
        {[
          [<CountUp to={30} suffix=" s" />, 'renovación del QR antifraude'],
          [<CountUp to={0} />, 'apps para descargar'],
          [<CountUp to={6} />, 'pasos para lanzar tu tarjeta'],
          [<CountUp to={14} suffix=" días" />, 'de prueba gratis'],
        ].map(([n, l], i) => <Reveal key={i} delay={i * 90} className="stat-pill"><span className="stat-pill-n gradient-text">{n}</span><span className="muted small">{l}</span></Reveal>)}
      </section>

      {/* DEMO INTERACTIVA */}
      <section className="section" id="demo">
        <div className="container">
          <Reveal className="section-head center-head">
            <span className="eyebrow"><MousePointerClick size={14} /> Demo en vivo</span>
            <h2>Probalo ahora: <span className="gradient-text">sos el empleado</span></h2>
            <p className="muted">Elegí un rubro, sumá sellos como lo haría tu equipo y mirá cómo se llena la tarjeta del cliente. Completala y canjeá el premio.</p>
          </Reveal>
          <Reveal><InteractiveDemo /></Reveal>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="section section-alt" id="como-funciona">
        <div className="container">
          <Reveal className="section-head"><h2>Cómo funciona</h2><p className="muted">Tres pasos, sin instalar nada.</p></Reveal>
          <div className="grid-3 steps-flow">
            {[
              [Sparkles, 'Creás tu tarjeta', 'Elegís sellos, visitas o puntos, definís el premio y la personalizás con tu logo y colores.'],
              [QrCode, 'Tus clientes se suman', 'Escanean el QR del mostrador desde su celular y obtienen su tarjeta digital en un minuto.'],
              [Gift, 'Sumás y premiás', 'Tu equipo escanea el QR del cliente y suma con un toque. Al completar la tarjeta, canjean el premio.'],
            ].map(([Icon, t, d]: any, i) => (
              <Reveal key={t} delay={i * 120} className="card glow-card step-card">
                <div className="step-num">{i + 1}</div>
                <div className="feature-icon"><Icon size={22} /></div>
                <h3>{t}</h3><p className="muted mb-0">{d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* BENEFICIOS */}
      <section className="section">
        <div className="container">
          <Reveal className="section-head"><h2>Todo lo que necesitás para que <span className="gradient-text">vuelvan más seguido</span></h2></Reveal>
          <div className="grid-3">
            {[
              [Smartphone, 'Sin apps', 'Funciona en cualquier celular Android o iPhone, desde el navegador.', '#B7F000'],
              [ShieldCheck, 'A prueba de trampas', 'QR que cambia cada 30 segundos, límites por día y registro de quién hizo cada operación.', '#22D3EE'],
              [BarChart3, 'Estadísticas claras', 'Clientes activos, recurrentes, canjes y rendimiento por sucursal y empleado.', '#A78BFA'],
              [Users, 'Tu equipo, con permisos', 'Roles para titular, administrador, encargado y empleado. Cada uno ve lo que necesita.', '#FF4D8D'],
              [Building2, 'Varias sucursales', 'Elegí en qué locales participa cada tarjeta y quién opera en cada uno.', '#FFC83D'],
              [Zap, 'Listo en minutos', 'Asistente guiado, afiche para imprimir y textos para redes incluidos.', '#B7F000'],
            ].map(([Icon, t, d, c]: any, i) => (
              <Reveal key={t} delay={(i % 3) * 100} className="card glow-card feature-card">
                <div className="feature-icon" style={{ background: `${c}22`, color: c }}><Icon size={22} /></div>
                <h3>{t}</h3><p className="muted mb-0">{d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CALCULADORA */}
      <section className="section section-alt" id="calculadora">
        <div className="container">
          <Reveal className="section-head"><span className="eyebrow">Calculadora</span><h2>¿Cuánto más podrías vender?</h2><p className="muted">Mové los controles con los números de tu negocio.</p></Reveal>
          <Reveal><RoiCalculator planPrice={list[1]?.price_ars ?? 29900} /></Reveal>
        </div>
      </section>

      {/* PRECIOS */}
      <section className="section" id="precios">
        <div className="container">
          <Reveal className="section-head center-head"><h2>Planes simples, <span className="gradient-text">sin sorpresas</span></h2><p className="muted">Precios mensuales en pesos argentinos. 14 días de prueba gratis en cualquier plan.</p></Reveal>
          <div className="grid-3 pricing">
            {list.map((p, i) => (
              <Reveal key={p.id} delay={i * 100} className={`card stack price-card ${i === 1 ? 'featured' : ''}`}>
                {i === 1 && <span className="badge badge-lime" style={{ alignSelf: 'flex-start' }}>⭐ Más elegido</span>}
                <div><h3 className="mb-0">{p.name}</h3><span className="small muted">{p.description}</span></div>
                <div className="price">{fmtMoney(p.price_ars)}<small> /mes</small></div>
                <PlanFeatures plan={p} />
                <Link to="/registro" className={`btn ${i === 1 ? 'btn-primary btn-glow' : ''}`} style={{ marginTop: 'auto' }}>Empezar gratis</Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section section-alt" id="preguntas">
        <div className="container narrow" style={{ maxWidth: 780 }}>
          <Reveal className="section-head"><h2>Preguntas frecuentes</h2></Reveal>
          <div className="stack-sm">{FAQ.map(([qq, a]) => <details key={qq} className="faq"><summary>{qq}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="section">
        <div className="container">
          <Reveal className="cta-band">
            <div>
              <h2 className="mb-1">Tu próxima clienta fiel está a un QR de distancia.</h2>
              <p className="mb-0">Creá tu tarjeta hoy y empezá a premiar a los que vuelven.</p>
            </div>
            <Link to="/registro" className="btn btn-lg btn-dark">Crear mi tarjeta gratis <ArrowRight size={18} /></Link>
          </Reveal>
        </div>
      </section>

      {/* CONTACTO */}
      <section className="section" id="contacto">
        <div className="container grid-2" style={{ alignItems: 'start' }}>
          <Reveal>
            <h2>Hablemos</h2>
            <p className="muted">¿Tenés una cadena, una franquicia o necesitás algo especial? Contanos y te contactamos.</p>
            <ul className="check-list mt-2">
              <li><Check size={16} />Demostración personalizada</li><li><Check size={16} />Ayuda con la configuración inicial</li><li><Check size={16} />Planes a medida para varias sucursales</li>
            </ul>
          </Reveal>
          <Reveal delay={120}><ContactForm /></Reveal>
        </div>
      </section>

      <Link to="/registro" className="sticky-cta">Probar gratis <ArrowRight size={16} /></Link>
    </>
  );
}

function ContactForm() {
  const [f, setF] = useState({ name: '', email: '', business: '', phone: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return <Alert kind="ok">¡Gracias! Te responderemos a la brevedad.</Alert>;
  return (
    <form className="card stack glow-card" onSubmit={async (e) => {
      e.preventDefault();
      if (f.website) return setDone(true); // trampa para bots (campo oculto)
      if (!isConfigured) return setError('El formulario se habilita al conectar la base de datos.');
      setBusy(true); setError(null);
      try { await rpc('submit_contact_request', { p_name: f.name, p_email: f.email, p_business: f.business, p_phone: f.phone, p_message: f.message }); setDone(true); }
      catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
    }}>
      <div className="form-grid">
        <Input label="Nombre" required minLength={2} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input label="Correo" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input label="Comercio" maxLength={120} value={f.business} onChange={(e) => setF({ ...f, business: e.target.value })} />
        <Input label="Teléfono" maxLength={40} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </div>
      <Textarea label="Mensaje" required minLength={5} maxLength={2000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} style={{ position: 'absolute', left: -9999 }} aria-hidden />
      {error && <Alert kind="err">{error}</Alert>}
      <Button variant="primary" type="submit" loading={busy} icon={<Gift size={16} />}>Enviar consulta</Button>
    </form>
  );
}
