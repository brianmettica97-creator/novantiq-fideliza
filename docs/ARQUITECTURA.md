# Arquitectura y seguridad

## Modelo multi-tenant

Cada comercio es una fila de `merchants`. Los registros comerciales llevan `merchant_id`: sucursales, programas, recompensas, tarjetas, movimientos, canjes, promociones y auditoría. Las claves foráneas compuestas `(merchant_id, id)` impiden mezclar registros de comercios distintos. Por ejemplo, no se puede vincular la sucursal de un comercio con el programa de otro, aunque se conozcan ambos IDs.

Los usuarios se vinculan a los comercios mediante `memberships (merchant_id, user_id, role, status, all_branches)`, y `membership_branches` restringe en qué sucursales puede operar cada uno. Una persona puede ser cliente de varios comercios y, a la vez, empleada de otro: los roles son contextuales.

## Matriz de permisos

La fuente de verdad es `public.role_has_permission` en SQL. `src/lib/permissions.ts` la replica para la interfaz, y una prueba automática verifica que ambas coincidan.

| Permiso | Titular | Administrador | Encargado | Empleado |
|---|:-:|:-:|:-:|:-:|
| Registrar compras y canjes (`operate`) | ✓ | ✓ | ✓ | ✓ |
| Buscar clientes (`customers.view`) | ✓ | ✓ | ✓ | ✓ (correo enmascarado) |
| Anular y ajustar (`adjust`) | ✓ | ✓ | ✓ | — |
| Estadísticas y movimientos (`stats`) | ✓ | ✓ | ✓ | — |
| Configurar comercio, tarjetas y recompensas (`config`) | ✓ | ✓ | — | — |
| Gestionar equipo (`team`) | ✓ | ✓ (sin administradores) | — | — |
| Auditoría (`audit`) | ✓ | ✓ | — | — |
| Suscripción (`billing`) | ✓ | — | — | — |

Reglas adicionales:

- Nadie modifica su propio rol.
- El titular no se puede modificar.
- Un administrador solo gestiona encargados y empleados.
- El **administrador global** está en `platform_admins`, una tabla sin políticas de escritura. Solo se agrega con SQL o con `service_role` y nunca depende de un campo editable del perfil.
- El **cliente final** solo ve sus tarjetas, sus secretos de QR y sus movimientos.

## Capas de protección

1. **RLS** en las 25 tablas. Los helpers `is_member`, `has_permission` e `is_platform_admin` son `SECURITY DEFINER` con `search_path` vacío.
2. **Privilegios mínimos por columna.**
   - Se revoca todo y se conceden solo las columnas editables. Por ejemplo, un comercio no puede tocar `merchants.status`, `programs.status`, `subscriptions` ni `cards.balance`.
   - `memberships`, `cards`, `card_transactions` y `redemptions` no tienen ningún permiso de escritura directa.
   - `invitations.token_hash` no se puede leer.
3. **Funciones RPC** para toda operación sensible. Validan permisos, estado de la suscripción, sucursal, reglas del programa y límites, y lo hacen dentro de una transacción con `SELECT … FOR UPDATE` sobre la tarjeta (y sobre la recompensa, si tiene stock). Esto evita condiciones de carrera entre solicitudes simultáneas.
4. **`EXECUTE` revocado por defecto** en todas las funciones. Solo se habilitan explícitamente las públicas y las de usuarios autenticados. `billing_apply_update` es exclusiva de `service_role`.
5. **Triggers de auditoría** en las tablas de configuración. Registran el diff campo por campo, con actor y fecha.

## QR y antifraude

- **QR de inscripción** (`/unirse/<join_code>`): solo crea la tarjeta del cliente. No modifica saldos.
- **QR de la tarjeta:** `NF1.<token>.<paso>.<firma>`.
  - El paso cambia cada 30 s.
  - La firma es `HMAC-SHA256(secret, token.paso)`.
  - El secreto vive en `card_secrets`, que solo puede leer el titular de la tarjeta.
  - El servidor acepta QR de hasta 2 minutos para la consulta y de hasta 10 minutos para confirmar la operación. Una captura de pantalla vieja no sirve.
- **Código manual** de 8 caracteres en Crockford base32 (40 bits aleatorios), para cuando la cámara falla. Queda registrado como `lookup_method = 'code'`.
- **Límites:**
  - Operaciones por día y tarjeta, y minutos mínimos entre operaciones (configurables por programa).
  - Operaciones y búsquedas por minuto por empleado (configurables en `platform_settings`).
  - Límites para el alta de comercios, las invitaciones, el formulario de contacto y los tickets de soporte.
- **Idempotencia:** cada intención de operación lleva una clave única por comercio (`unique (merchant_id, idempotency_key)`). Si una solicitud se reintenta, devuelve el resultado original.
- **Intentos rechazados:** QR inválidos, tarjetas ajenas, límites alcanzados y tarjetas bloqueadas se guardan en `audit_log` como `operation_rejected`. Aparecen en el panel y en la auditoría para investigar incidentes. Los intentos rechazados cuentan para los límites de frecuencia porque se registran fuera del bloque que se revierte.

## Saldos y correcciones

- El saldo (`cards.balance`) solo se modifica dentro de las funciones, y cada cambio genera una fila en `card_transactions`. Cada fila guarda: `program_version`, quién operó, la sucursal, el método, el saldo resultante y la clave de idempotencia.
- Las **anulaciones** crean un movimiento `reversal` (vinculado de forma única al original) y marcan el original como `reversed`. Nada se borra.
- Para anular un sello que ya se consumió en un canje, primero hay que anular el canje. Así el saldo nunca queda negativo.
- Anular un canje cancela la redención, devuelve el saldo y libera el stock, siempre que la redención original siga vigente.
- Los **ajustes manuales** exigen motivo y quedan auditados.

## Versionado de reglas

Cada cambio en las reglas de un programa incrementa `programs.version` y guarda una copia en `program_versions`. Las reglas que se versionan son: sellos necesarios, puntos, límites, bienvenida, fechas, sucursales y condiciones.

**Política:** los saldos acumulados se conservan, y las nuevas reglas aplican a las operaciones siguientes. Los movimientos anteriores conservan la versión con la que se registraron.

El tipo de programa no se puede cambiar. Para eso se duplica el programa.

## Tipos de programa

| Tipo | Acumula | Canje |
|---|---|---|
| `stamps` | 1 a N sellos por compra (tope configurable) | Descuenta el costo |
| `visits` | 1 visita por operación | Descuenta el costo |
| `points` | `floor(importe / earn_amount) × earn_points`, con tope por operación e importe máximo | Descuenta el costo |
| `milestones` | 1 compra (contador acumulativo) | No descuenta; cada hito se canjea una vez por cliente |

Los puntos y los hitos requieren el plan Profesional o superior (validación en un trigger y en `set_program_status`).

## Suscripción

Estados posibles: `trialing`, `active`, `past_due`, `paused` y `cancelled`. `merchant_operational_status` decide si el comercio puede operar:

- **Prueba:** mientras esté vigente.
- **Activa o con pago pendiente:** hasta `current_period_end` más los días de gracia (`billing.grace_days`).
- **Cancelada:** hasta el fin del período ya abonado.

Si el comercio no está operativo, se bloquean las altas de clientes, las compras y los canjes, pero se puede seguir consultando la información.

Mercado Pago confirma el pago por webhook firmado (`x-signature`). La función vuelve a consultar el estado real en la API y registra cada evento en `billing_events` para garantizar la idempotencia.

## Diseños de tarjeta por rubro

`programs.theme` admite estos valores:

| Valor | Diseño |
|---|---|
| `classic` | Colores e ícono propios del comercio |
| `cafe` | Barista |
| `barber` | Old School |
| `burger` | Diner |
| `icecream` | Gelato |
| `carwash` | Splash |
| `gym` | Power |
| `beauty` | Glow |
| `pets` | Huellitas |

- `src/components/ThemedCard.tsx` dibuja cada diseño: su visual de progreso, la animación al sumar (`.fresh`) y el festejo al completar (`.party`).
- Los estilos están en `src/styles/themes.css`. Se escalan con *container queries*, así que el mismo diseño se ve bien en la billetera, el mostrador, el panel y la web.
- El asistente sugiere el diseño según el rubro del comercio (`themeForCategory`).
