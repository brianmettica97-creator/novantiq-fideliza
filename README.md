# NOVANTIQ Fideliza

Plataforma SaaS multi-tenant de fidelización digital para comercios de Argentina. Cada comercio crea tarjetas de sellos, visitas, puntos o hitos. Sus clientes las usan desde el celular, sin instalar apps, y el equipo registra compras y canjes escaneando un QR rotativo.

| Área | Ruta | Quién |
|---|---|---|
| Sitio comercial | `/`, `/terminos`, `/privacidad` | Público |
| Inscripción a un programa | `/unirse/:codigo` | Público → cliente |
| Billetera del cliente | `/mis-tarjetas`, `/mi-cuenta` | Cliente final |
| Mostrador | `/operar` | Todo el equipo del comercio |
| Panel del comercio | `/panel/*` | Titular, administrador, encargado |
| Administración NOVANTIQ | `/admin/*` | Administradores globales |

## Arquitectura

- **Frontend:** React 19 + Vite + TypeScript, sin framework de CSS (sistema de diseño propio en `src/styles/global.css`). Es una SPA estática que se despliega en Vercel, Netlify o Cloudflare Pages.
- **Backend:** Supabase.
  - PostgreSQL con **Row Level Security** en todas las tablas.
  - **Funciones RPC `SECURITY DEFINER`** para toda operación sensible: sumar, canjear, anular, ajustar, invitar y cambiar roles.
  - Auth con correo + contraseña, enlace mágico y PKCE.
  - Storage para logos.
- **Edge Functions (Deno):** las únicas piezas que usan secretos: Mercado Pago (`billing-checkout`, `billing-webhook`, `billing-cancel`) y la eliminación de cuenta (`delete-account`).

El navegador **nunca** decide permisos ni saldos. Ver [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) para el modelo de datos, la matriz de permisos y las medidas antifraude.

```
supabase/migrations/   Esquema, seguridad (RLS, grants), lógica de negocio, storage
supabase/functions/    Edge Functions (pagos y eliminación de cuenta)
src/lib/               Cliente Supabase, QR, permisos, formatos
src/pages/             public · auth · wallet · operate · panel · admin
tests/db/              Pruebas de la base real (PGlite): tenancy, roles, operaciones, facturación
tests/unit/            Pruebas de lógica del cliente
```

## Desarrollo local

Requisitos: Node 20 o superior.

```bash
npm install
cp .env.example .env.local     # completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev                    # http://localhost:5173
```

Sin `.env.local`, el sitio comercial funciona igual, pero las áreas privadas muestran un aviso de configuración.

## Pruebas

```bash
npm test            # todas (83 pruebas)
npm run test:db     # base de datos: migraciones reales sobre PostgreSQL (PGlite/WASM)
npm run typecheck
npm run build
```

Las pruebas de base de datos aplican **las mismas migraciones de producción** sobre PostgreSQL real, con una réplica del esquema `auth` y de los roles de Supabase (`tests/db/supabase-shim.sql`). Verifican, entre otras cosas:

- **Accesos cruzados entre comercios:** lectura, escritura y llamadas RPC con IDs ajenos.
- **Escalada de privilegios:** editar el propio rol, autoasignarse admin global, editar saldos o estados con `UPDATE` directo, aceptar invitaciones ajenas.
- **QR:** válido, vencido (captura vieja) y falsificado. También verifican que el HMAC del navegador coincide con el del servidor.
- **Operaciones:** idempotencia, límite diario, tiempo mínimo entre compras, límite de frecuencia por empleado, tarjetas bloqueadas y programas pausados.
- **Canjes y correcciones:** canje atómico, stock, máximo por cliente, anulación compensatoria, anulación de canjes y ajustes con motivo.
- **Puntos, hitos y bienvenida:** cálculo de puntos, recompensas por hitos y beneficio de bienvenida.
- **Planes:** límites y funciones incluidas en cada plan.
- **Suscripción:** estados (prueba, activa, gracia, cancelada).
- **Permisos:** paridad de la matriz de permisos entre el frontend y SQL.

## Despliegue a producción

### 1. Supabase

1. Crear un proyecto en <https://supabase.com> (región São Paulo recomendada para Argentina).
2. Vincular y aplicar migraciones:
   ```bash
   npx supabase login
   npx supabase link --project-ref TU_REF
   npx supabase db push
   ```
3. **Authentication → URL Configuration:**
   - Site URL: `https://TU-DOMINIO`.
   - Redirect URLs: `https://TU-DOMINIO/auth/callback`.
4. **Authentication → Providers → Email:**
   - Confirmar correo: activado.
   - Cambio de correo seguro: activado.
   - Contraseña mínima: 8.
5. **Authentication → SMTP:** configurar un SMTP propio (Resend, Brevo, etc.). El SMTP de Supabase tiene un límite muy bajo y no sirve para producción.
6. **Opcional, captcha:** Authentication → Attack Protection → Turnstile. Luego definir `VITE_TURNSTILE_SITE_KEY` en el frontend.
7. **Primer administrador global.** Primero registrate en la web y después ejecutá en el SQL Editor:
   ```sql
   insert into public.platform_admins (user_id, note)
   select id, 'Propietario' from auth.users where email = 'tu@correo.com';
   ```
8. **Recomendado:** con `pg_cron`, programar `select public.cleanup_rate_limits();` una vez por día.

### 2. Mercado Pago (suscripciones)

1. Crear una aplicación en <https://www.mercadopago.com.ar/developers> y obtener el **Access Token** de producción.
2. En **Webhooks**, configurar:
   - URL: `https://TU_REF.supabase.co/functions/v1/billing-webhook`.
   - Eventos: *Planes y suscripciones* (`subscription_preapproval`, `subscription_authorized_payment`).
   - Copiar la **clave secreta** que genera Mercado Pago.
3. Cargar los secretos y desplegar las funciones:
   ```bash
   npx supabase secrets set MP_ACCESS_TOKEN=APP_USR-... MP_WEBHOOK_SECRET=... SITE_URL=https://TU-DOMINIO
   npx supabase functions deploy billing-checkout
   npx supabase functions deploy billing-cancel
   npx supabase functions deploy delete-account
   npx supabase functions deploy billing-webhook --no-verify-jwt
   ```
   `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles dentro de las funciones.
4. Probar con usuarios de prueba de Mercado Pago antes de cobrar a comercios reales.

Mientras Mercado Pago no esté configurado, los comercios igual pueden usar la prueba gratuita. Un administrador global también puede activar suscripciones a mano desde `/admin/comercios`, por ejemplo para cobros por transferencia o cortesías.

### 3. Frontend

**Vercel** (recomendado; `vercel.json` ya incluye las reglas de SPA y las cabeceras de seguridad, CSP incluida):

```bash
npx vercel           # Framework: Vite · Build: npm run build · Output: dist
```

Variables de entorno en el proveedor:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SITE_URL=https://TU-DOMINIO`
- `VITE_TURNSTILE_SITE_KEY` (opcional)

Netlify usa `netlify.toml`, y Cloudflare Pages usa `public/_redirects`. **GitHub Pages no sirve**: no aplica las cabeceras de seguridad y el proyecto necesita que las rutas de la SPA se reescriban.

### 4. Dominio

Apuntar el dominio, por ejemplo `fideliza.novantiq.com.ar`, al proveedor del frontend y actualizar con ese dominio:

- La Site URL de Supabase.
- El secreto `SITE_URL` de las funciones.
- `VITE_SITE_URL` en el frontend.

## Seguridad: lo que nunca va al repositorio

- `.env.local` y cualquier `.env.*` (ya están en `.gitignore`).
- La `service_role` key de Supabase, el Access Token y el secreto de webhook de Mercado Pago. Se guardan solo con `supabase secrets set`.

La `anon key` es pública por diseño: lo que protege los datos es RLS y las funciones del servidor.

## Pendientes conocidos

Ver [docs/PENDIENTES.md](docs/PENDIENTES.md).
