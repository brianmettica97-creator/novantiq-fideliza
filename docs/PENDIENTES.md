# Pendientes y decisiones del propietario

## Requiere acción del propietario (bloquea la salida a producción)

| Qué | Para qué | Dónde se usa |
|---|---|---|
| Proyecto Supabase (URL, anon key, project ref) | Base de datos, autenticación y archivos | `.env.local`, `supabase link` |
| SMTP propio (Resend, Brevo, etc.) | Correos de confirmación, enlaces mágicos y recuperación | Supabase → Auth → SMTP |
| Cuenta de Mercado Pago: Access Token + secreto de webhook | Cobro de suscripciones | `supabase secrets set` |
| Dominio | URL pública, enlaces de inscripción, retorno de pagos | Proveedor del frontend + Supabase |
| Cuenta en Vercel/Netlify/Cloudflare | Hosting del frontend | — |
| **Precios finales de los planes** | Hoy hay valores de referencia: $14.900 / $29.900 / $59.900 | `/admin/planes` o la migración |
| Duración de la prueba gratuita y plan de prueba (hoy: 14 días en plan Profesional) | Estrategia comercial | `/admin/ajustes` |
| Razón social, CUIT, domicilio, jurisdicción y correo legal | Términos y política de privacidad (hoy son borradores) | `src/pages/public/Legal.tsx` |
| Revisión legal de los textos | Ley 24.240 y Ley 25.326. Evaluar la inscripción de la base de datos ante la AAIP | — |
| Revisión de la marca "NOVANTIQ Fideliza" | Disponibilidad ante el INPI | — |
| Facturación fiscal (AFIP/ARCA) | La plataforma cobra, pero no emite facturas electrónicas | Integración futura |

## Limitaciones actuales, documentadas a propósito

- **Pruebas de concurrencia:** PGlite usa una sola conexión, así que no se pudieron simular dos solicitudes realmente simultáneas. La protección (bloqueo `FOR UPDATE` de la tarjeta y de la recompensa, más una clave de idempotencia única) es estándar en PostgreSQL. Igual conviene verificarla con una prueba de carga contra el proyecto real.
- **Edge Functions:** están escritas y revisadas, pero no se ejecutaron en este entorno, porque hacen falta Deno, credenciales de Mercado Pago y un proyecto Supabase. Hay que probarlas con usuarios de prueba de Mercado Pago.
- **Políticas de Storage** (`20261025000400_storage.sql`): son exclusivas de Supabase y no forman parte de las pruebas locales.
- **Pruebas de interfaz:** no hay pruebas end-to-end en navegador. El código compila con TypeScript estricto y la lógica crítica está en la base, donde sí está probada. Recomendado: agregar Playwright una vez conectado Supabase.
- **Autoservicio sin empleado:** no está habilitado. Todas las sumas las registra una persona del equipo. Para habilitarlo se recomienda un código de un solo uso generado por el empleado, con vencimiento de 2 minutos.
- **Correo de invitación:** la invitación genera un enlace que el titular comparte por WhatsApp o correo. El envío automático necesita el SMTP.
- **Notificaciones push / Apple y Google Wallet:** no están implementadas.
- **Tamaño del bundle:** pesa unos 245 KB gzip. Se puede dividir con `React.lazy` para el panel y la administración.
- **Requisitos de la sección 12 en adelante:** el documento de requisitos llegó cortado en la sección 12 ("Panel del comercio → Inicio"). El panel se implementó con las métricas listadas y otras habituales. Falta revisar las secciones siguientes.
