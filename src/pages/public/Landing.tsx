import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Building2, Check, Gift, ShieldCheck, Smartphone, Sparkles, Store, Users, Zap } from 'lucide-react';
import { LoyaltyCard } from '../../components/LoyaltyCard';
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

const EXAMPLES = [
  { type: 'stamps' as const, name: 'Café Frecuente', merchantName: 'Ejemplo · Cafetería', bgColor: '#3B2416', textColor: '#FFF6EC', accentColor: '#E8B77D', stampIcon: 'coffee', stampsRequired: 8, balance: 5, rewardName: 'Café gratis' },
  { type: 'visits' as const, name: 'Barber Pass', merchantName: 'Ejemplo · Barbería', bgColor: '#17191D', textColor: '#FFFFFF', accentColor: '#B7F000', stampIcon: 'scissors', stampsRequired: 6, balance: 4, rewardName: 'Corte gratis' },
  { type: 'points' as const, name: 'Club Burger', merchantName: 'Ejemplo · Hamburguesería', bgColor: '#FF6B4A', textColor: '#1A0B06', accentColor: '#FFFFFF', stampIcon: 'burger', stampsRequired: null, balance: 1240, rewardName: 'Combo doble' },
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
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow"><Sparkles size={14} /> Fidelización digital para comercios</span>
            <h1>Hacé que tus clientes <span className="lime">vuelvan</span>.</h1>
            <p className="muted" style={{ fontSize: '1.15rem', maxWidth: 540 }}>Tarjetas de sellos, visitas y puntos en el celular de tus clientes. Sin apps, sin papel y sin trampas. Configuralo en minutos.</p>
            <div className="row mt-2">
              <Link to="/registro" className="btn btn-primary btn-lg">Probar 14 días gratis</Link>
              <a href="#como-funciona" className="btn btn-lg">Cómo funciona</a>
            </div>
            <p className="small subtle mt-2">Sin tarjeta de crédito · Cancelás cuando quieras</p>
          </div>
          <div className="stack" style={{ alignItems: 'center' }}>
            <LoyaltyCard look={{ ...EXAMPLES[0], code: 'K7Q9M2XP' }} />
          </div>
        </div>
      </section>

      <section className="section section-alt" id="como-funciona">
        <div className="container">
          <div className="section-head"><h2>Cómo funciona</h2><p className="muted">Tres pasos, sin instalar nada.</p></div>
          <div className="grid-3">
            {[
              ['Creás tu tarjeta', 'Elegís sellos, visitas o puntos, definís el premio y la personalizás con tu logo y colores.'],
              ['Tus clientes se suman', 'Escanean el QR del mostrador desde su celular y obtienen su tarjeta digital en un minuto.'],
              ['Tu equipo registra cada compra', 'Escanean el QR del cliente y suman con un toque. Al completar la tarjeta, canjean el premio.'],
            ].map(([t, d], i) => <div key={t} className="card"><div className="step-num">{i + 1}</div><h3>{t}</h3><p className="muted mb-0">{d}</p></div>)}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head"><h2>Beneficios</h2><p className="muted">Todo lo que necesitás para aumentar la frecuencia de compra.</p></div>
          <div className="grid-3">
            {[
              [Smartphone, 'Sin apps', 'Funciona en cualquier celular Android o iPhone, desde el navegador.'],
              [ShieldCheck, 'A prueba de trampas', 'QR que cambia cada 30 segundos, límites por día y registro de quién hizo cada operación.'],
              [BarChart3, 'Estadísticas claras', 'Clientes activos, recurrentes, canjes y rendimiento por sucursal y empleado.'],
              [Users, 'Tu equipo, con permisos', 'Roles para titular, administrador, encargado y empleado. Cada uno ve lo que necesita.'],
              [Building2, 'Varias sucursales', 'Elegí en qué locales participa cada tarjeta y quién opera en cada uno.'],
              [Zap, 'Listo en minutos', 'Asistente guiado, afiche para imprimir y textos para redes incluidos.'],
            ].map(([Icon, t, d]: any) => <div key={t} className="card"><div className="feature-icon"><Icon size={22} /></div><h3>{t}</h3><p className="muted mb-0">{d}</p></div>)}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-head"><h2>Para todo tipo de comercio</h2><p className="muted">Sellos para gastronomía, visitas para servicios y puntos para compras de distinto importe.</p></div>
          <div className="chip-cloud">{CATEGORIES.filter((c) => c.id !== 'otro').map((c) => <span key={c.id} className="chip"><Store size={14} color="var(--lime)" />{c.label}</span>)}</div>
          <h3 className="mt-3">Ejemplos de tarjetas</h3>
          <p className="small subtle">Diseños ilustrativos. Cada comercio usa su propio nombre, logo y colores.</p>
          <div className="grid-3">{EXAMPLES.map((e) => <LoyaltyCard key={e.name} look={e} />)}</div>
        </div>
      </section>

      <section className="section" id="precios">
        <div className="container">
          <div className="section-head"><h2>Planes y precios</h2><p className="muted">Precios mensuales en pesos argentinos. 14 días de prueba gratis en cualquier plan.</p></div>
          <div className="grid-3">
            {list.map((p, i) => (
              <div key={p.id} className={`card stack ${i === 1 ? 'card-accent' : ''}`}>
                {i === 1 && <span className="badge badge-lime" style={{ alignSelf: 'flex-start' }}>Más elegido</span>}
                <div><h3 className="mb-0">{p.name}</h3><span className="small muted">{p.description}</span></div>
                <div className="price">{fmtMoney(p.price_ars)}<small> /mes</small></div>
                <PlanFeatures plan={p} />
                <Link to="/registro" className={`btn ${i === 1 ? 'btn-primary' : ''}`} style={{ marginTop: 'auto' }}>Empezar gratis</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt" id="preguntas">
        <div className="container narrow" style={{ maxWidth: 780 }}>
          <div className="section-head"><h2>Preguntas frecuentes</h2></div>
          <div className="stack-sm">{FAQ.map(([qq, a]) => <details key={qq} className="faq"><summary>{qq}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="section" id="contacto">
        <div className="container grid-2" style={{ alignItems: 'start' }}>
          <div>
            <h2>Hablemos</h2>
            <p className="muted">¿Tenés una cadena, una franquicia o necesitás algo especial? Contanos y te contactamos.</p>
            <ul className="check-list mt-2">
              <li><Check size={16} />Demostración personalizada</li><li><Check size={16} />Ayuda con la configuración inicial</li><li><Check size={16} />Planes a medida para varias sucursales</li>
            </ul>
          </div>
          <ContactForm />
        </div>
      </section>
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
    <form className="card stack" onSubmit={async (e) => {
      e.preventDefault();
      if (f.website) return setDone(true); // trampa para bots (campo oculto)
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
