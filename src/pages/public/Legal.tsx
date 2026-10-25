import { Alert } from '../../components/ui';

const UPDATED = '25 de octubre de 2026';

function Draft() {
  return <Alert kind="warn">Borrador preparado como base. Debe ser revisado por un asesor legal antes de publicarse comercialmente (razón social, CUIT, domicilio y jurisdicción).</Alert>;
}

export function TermsPage() {
  return (
    <div className="container section legal">
      <h1>Términos y condiciones</h1>
      <p className="muted">Última actualización: {UPDATED}</p>
      <Draft />
      <h2>1. Objeto</h2>
      <p>NOVANTIQ Fideliza (“la Plataforma”) es un servicio de software provisto por NOVANTIQ que permite a comercios (“Comercios”) crear y administrar programas de fidelización digitales para sus clientes (“Clientes”).</p>
      <h2>2. Cuentas</h2>
      <p>Para usar la Plataforma se requiere una cuenta con un correo electrónico válido y verificado. Cada usuario es responsable de la confidencialidad de sus credenciales y de las acciones realizadas con su cuenta. Los Comercios deben invitar a su personal con cuentas individuales; está prohibido compartir credenciales.</p>
      <h2>3. Suscripción y pagos</h2>
      <ul>
        <li>Los Comercios acceden mediante una suscripción mensual según el plan elegido. Se ofrece un período de prueba gratuito cuya duración se informa al registrarse.</li>
        <li>Los cobros se procesan a través de Mercado Pago. NOVANTIQ no almacena datos de tarjetas.</li>
        <li>Si un pago no se acredita, la cuenta puede pasar a estado “pago pendiente” y, vencido el período de gracia, las operaciones se suspenden hasta regularizar. Los datos se conservan.</li>
        <li>El Comercio puede cancelar en cualquier momento; el servicio continúa hasta el fin del período abonado. No se realizan reintegros proporcionales salvo que la ley lo exija.</li>
        <li>Los precios pueden modificarse con aviso previo de al menos 30 días.</li>
      </ul>
      <h2>4. Programas de fidelización</h2>
      <p>Cada Comercio es el único responsable de las reglas, recompensas, condiciones, vigencia y cumplimiento de su programa frente a sus Clientes, incluida la normativa de defensa del consumidor (Ley 24.240). NOVANTIQ provee la herramienta tecnológica y no es parte de la relación comercial entre el Comercio y sus Clientes.</p>
      <p>Los sellos, puntos y recompensas no tienen valor monetario, no son canjeables por dinero y no son transferibles, salvo que el Comercio disponga lo contrario.</p>
      <h2>5. Uso aceptable</h2>
      <p>Queda prohibido: intentar acceder a datos de otros Comercios o Clientes, manipular saldos por fuera de los flujos habilitados, automatizar operaciones, realizar ingeniería inversa, o usar la Plataforma para fines ilícitos. NOVANTIQ puede suspender cuentas ante indicios de abuso o fraude.</p>
      <h2>6. Disponibilidad</h2>
      <p>NOVANTIQ realiza esfuerzos razonables para mantener el servicio disponible, sin garantizar un funcionamiento ininterrumpido. Podrán realizarse mantenimientos programados.</p>
      <h2>7. Responsabilidad</h2>
      <p>En la máxima medida permitida por la ley, la responsabilidad de NOVANTIQ se limita al monto abonado por el Comercio en los últimos tres meses.</p>
      <h2>8. Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes de la República Argentina. [Completar jurisdicción.]</p>
      <h2>9. Contacto</h2>
      <p>Consultas: hola@novantiq.com.ar [confirmar correo].</p>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <div className="container section legal">
      <h1>Política de privacidad</h1>
      <p className="muted">Última actualización: {UPDATED}</p>
      <Draft />
      <h2>1. Responsable</h2>
      <p>NOVANTIQ [razón social, CUIT, domicilio] es responsable del tratamiento de los datos de las cuentas de la Plataforma. Respecto de los datos de los Clientes de cada programa, el Comercio actúa como responsable y NOVANTIQ como encargado del tratamiento, conforme a la Ley 25.326 de Protección de Datos Personales.</p>
      <h2>2. Datos que recopilamos</h2>
      <ul>
        <li><strong>Clientes:</strong> nombre, correo electrónico y, opcionalmente, teléfono. Movimientos de sus tarjetas (fecha, sucursal, sellos o puntos, canjes).</li>
        <li><strong>Comercios y equipos:</strong> datos de la cuenta, del negocio y registro de las operaciones realizadas.</li>
        <li><strong>Datos técnicos:</strong> registros de seguridad necesarios para prevenir abusos.</li>
      </ul>
      <p>No solicitamos datos sensibles ni almacenamos datos de tarjetas de pago.</p>
      <h2>3. Finalidad</h2>
      <p>Prestar el servicio de fidelización, permitir al Comercio gestionar su programa, prevenir fraudes y cumplir obligaciones legales. No vendemos datos personales.</p>
      <h2>4. Con quién se comparten</h2>
      <p>Los datos de un Cliente solo son visibles para el Comercio en cuyo programa se inscribió. Ningún Comercio puede ver datos de Clientes de otro Comercio. Utilizamos proveedores de infraestructura (Supabase para base de datos y autenticación) y de pagos (Mercado Pago) bajo acuerdos de confidencialidad.</p>
      <h2>5. Seguridad</h2>
      <p>Aplicamos cifrado en tránsito, controles de acceso a nivel de base de datos, separación de datos por comercio, registros de auditoría y códigos QR rotativos.</p>
      <h2 id="derechos">6. Tus derechos</h2>
      <p>Podés acceder, rectificar, actualizar o suprimir tus datos. Desde “Mi cuenta” podés descargar tus datos y darte de baja de cada tarjeta. Para eliminar tu cuenta escribí a hola@novantiq.com.ar [confirmar] desde el correo registrado. La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, atiende denuncias y reclamos.</p>
      <h2>7. Conservación</h2>
      <p>Conservamos los datos mientras la cuenta esté activa. El historial de movimientos puede conservarse por el plazo necesario para resolver reclamos y cumplir obligaciones legales.</p>
    </div>
  );
}
