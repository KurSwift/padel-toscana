# Contexto del proyecto — Padel Toscana

Este documento explica el **dominio de negocio** y las reglas que gobiernan la
app, para que cualquier persona (o agente) que llegue al repo entienda el
"por qué" detrás del código, no solo el "qué".

## Qué es esto

Padel Toscana es una **app privada de reservación de canchas de pádel y
casa club** para los residentes de un fraccionamiento llamado "Toscana",
compuesto por exactamente tres calles:

```
Nogal · Olivo · Encino
```

(ver `VALID_STREETS` en `src/types/index.ts`). No es una app pública — un
administrador da de alta a cada colono directamente (ver "Flujo de alta y
login" abajo; no hay auto-registro). Las excepciones públicas sin login son
`/calendario` (disponibilidad) y `/privacidad` (aviso de Analytics) — ver
sus secciones dedicadas más abajo.

## Roles

Cuatro roles, en `UserProfile.role` (`src/types/index.ts`):

| Rol | Descripción |
|---|---|
| **`colono`** | Puede reservar/cancelar sus propias reservaciones una vez aprobado. Rol por default al registrarse. |
| **`admin`** | Aprueba/rechaza registros, gestiona canchas (horarios, reglas), ve y cancela cualquier reservación. Ya no cambia el rol de otros usuarios — eso quedó exclusivo de `super-admin` (ver abajo). |
| **`tesorero`** | Confirma que una reservación `solicitada` ya fue pagada desde `/pagos` (`TesoreroPage.tsx`) y resuelve depósitos de Casa Club finalizada. Un admin/super-admin también puede entrar a esa ruta. |
| **`super-admin`** | Superset de `admin` — entra a `/configuracion` con las mismas capacidades, más asignar el rol de cualquier otro usuario y eliminar cuentas (exclusivo suyo, ver `canAssignRole()`/`canActOnUser()` en `src/services/userRules.ts`, `adminSetUserRole`/`adminDeleteColono` en `functions/src/index.ts`, e `isSuperAdmin()` en `firestore.rules`). Se asigna a mano en Firestore (bootstrap) o vía `adminSetUserRole` si ya hay otro super-admin — no hay UI de auto-promoción para el primero. |

Un usuario tiene además un `status`: `pending` → `active` → (o `rejected`).
Solo usuarios `active` pueden crear reservaciones. Los usuarios creados antes
de que existiera este campo se tratan como `active` por default (ver
`isActiveUser()` en `firestore.rules` y los fallbacks `?? 'active'` en la UI).

**Estado del épico de super-admin** (2026-08-30): **completo** — los 5
issues del Epic [#43](https://github.com/KurSwift/padel-toscana/issues/43)
están cerrados (#38, #39, #40, #41, #42). `super-admin` existe en
`UserRole`, `firestore.rules` lo reconoce (`isAdmin()` lo incluye como
superset; `isSuperAdmin()` es la única vía para cambiar `role` de otro
usuario o escribir `settings/theme`), `adminCreateColono` lo acepta igual
que `admin`. Todo vive en `/configuracion` → pestaña "Avanzado" (`AdvancedTab` en
`AdminPage.tsx`, solo visible para super-admin):
- **Asignar roles** — se quitó del tab Usuarios normal.
- **Logo del sitio** — sube a Firebase Storage (`src/services/branding.ts`,
  ruta fija `branding/logo`, ver `storage.rules`); se muestra en el navbar
  (`Header.tsx`) y en `/login` (`Logo.tsx`), y sin logo subido cae al
  badge "P" verde de siempre.
- **Color de acento** — paletas curadas (`src/theme/palettes.ts`, 7
  opciones basadas en las escalas default de Tailwind), guardadas en
  `settings/theme` (Firestore, `{ paletteId }`) y aplicadas en runtime vía
  `ThemeContext.tsx` (variables CSS `--brand-*`, `tailwind.config.js`
  apunta `brand.{50..900}` ahí) — cambia toda la UI sin recargar.
  **Limitación conocida, no arreglada**: `manifest.json`, el
  `theme-color` de `index.html`, `favicon.svg`, y los templates HTML de
  correo en `src/services/users.ts` se quedan en verde fijo (archivos
  estáticos o HTML de correo ya enviado, fuera de alcance de un cambio en
  runtime de React).
- **Nombre del sitio y contacto** (2026-08-31, fuera de los 5 issues
  originales del Epic — extensión pedida después de cerrarlo): mismo
  patrón que logo/color — `settings/general` (`{ siteName, whatsappUrl }`)
  vía `SiteSettingsContext.tsx`. El nombre reemplaza el "Padel Toscana"
  hardcodeado en Home/Login/RegisterPage y fija `document.title` en
  runtime; el link de WhatsApp reemplaza el texto plano de la tarjeta de
  contacto en `HelpPage` (si no hay link configurado, se queda igual que
  antes). Misma limitación de archivos estáticos que el color: `manifest.json`,
  los meta tags de `index.html`, y el subject/body del email en
  `src/services/users.ts` se quedan con "Padel Toscana" fijo.

Promover a alguien a `super-admin` sigue sin tener UI — requiere editar
el doc `users/{uid}` directo en Firestore (consola o script).

## Navegación autenticada y diseño responsive (actualizado 2026-09-08)

Todas las rutas autenticadas viven dentro de `AppShell.tsx`. En móvil usa
una **tab bar** fija inferior y desde el breakpoint `md` (tableta y desktop)
la misma navegación se presenta como un **sidebar** fijo, al estilo de una
app de iPad. `navigationForRole()` en `src/services/navigationRules.ts` es
la fuente de verdad tanto de los destinos visibles como de su orden:

| Destino | Ruta | Visible para |
|---|---|---|
| Calendario | `/` | todos |
| Reservaciones | `/reservaciones` | todos |
| Ayuda | `/ayuda` | todos |
| Pagos | `/pagos` | tesorero, admin y super-admin |
| Configuración | `/configuracion` | admin y super-admin |

La barra superior muestra el nombre configurable del sitio y el del usuario.
La campana solo es decorativa por ahora (`Notificaciones próximamente`). Al
tocar el encabezado de cuenta se abre una hoja con nombre, domicilio y
**Cerrar sesión**, disponible para todos los roles; en desktop el mismo
acceso queda al fondo del sidebar. Las rutas históricas `/admin` y
`/tesorero` redirigen respectivamente a `/configuracion` y `/pagos`, para
conservar favoritos y enlaces existentes.

El Calendario tiene un selector segmentado **Cancha / Casa Club**. Al cambiar
de fecha, `useCourtData()` oculta la disponibilidad mientras llega el
snapshot de esa fecha, para que nunca se vea ni se pueda seleccionar la
información del día anterior. `DateSelector` y el selector del panel de
reservaciones de Configuración tienen nombres accesibles para sus acciones
de día anterior/siguiente.

Para **Casa Club**, `ReservationCalendar` sustituye el selector diario por
`CasaClubMonthCalendar`: carga las reservaciones del mes visible y permite
ver de un vistazo qué días están ocupados, dentro de la ventana configurable
de anticipación. Cancha conserva la navegación por día porque sus
reservaciones son por horario.

## Flujo de alta y login (actualizado 2026-08-30 — reemplaza el auto-registro)

Desde el alta de colonos por admin (ver Epic
[#33](https://github.com/KurSwift/padel-toscana/pull/33)), ya no hay
auto-registro por default. El flujo real:

1. **Alta**: un admin (o `super-admin` — ver "Roles" arriba) va a
   `/configuracion` → Usuarios → "Agregar colono", captura
   nombre, calle, número y teléfono. `adminCreateColono`
   (`functions/src/index.ts`, Cloud Function con Admin SDK) crea la cuenta
   de Firebase Auth (por teléfono) + `users/{uid}` con `status: 'active'`
   **de inmediato** (sin paso de aprobación) + actualiza
   `addresses/{street numero}` — mismo límite de **2 usuarios por
   domicilio** (`MAX_USERS_PER_ADDRESS`/`isAddressAvailable` en
   `functions/src/colonoRules.ts`) que antes.
2. **Login** (`/login`, `LoginPage.tsx`): domicilio primero (calle +
   número) → `getResidentsByAddress` (Cloud Function, pre-auth) busca si
   hay un colono activo ahí y saluda por nombre ("Bienvenid@ {nombre}") →
   teléfono +52 vía OTP (Firebase Auth). La consulta se limita a 10 intentos
   por IP en una ventana fija de 5 minutos; la IP se guarda solo como hash en
   `lookupRateLimits`. Si nadie está registrado en ese domicilio, error — no
   hay fallback a auto-registro.
3. **Excepción hardcodeada**: `GOOGLE_LOGIN_ADDRESS = 'nogal 35'` en
   `LoginPage.tsx` — solo esa cuenta (la admin original, que predata este
   modelo) puede entrar con Google. Cualquier otro domicilio solo tiene
   teléfono.
4. Si el perfil no existe tras autenticar, la persona no puede entrar
   (mensaje pidiendo contactar al admin) — ya no se manda a `/registro`.

**El auto-registro viejo sigue intacto en el código, solo sin punto de
entrada** (decisión explícita — no se borró nada): `RegisterPage.tsx`,
`registerUser()` (`src/services/users.ts`, escribe `status: 'pending'` +
un doc en `mail/` para notificar al admin), la ruta `/registro` (sin
guard), y `approveUser`/`rejectUser` en `AdminPage.tsx` siguen
funcionando si alguien llega ahí por URL directa — pero `/login` ya no
enlaza a ese flujo. También existe `scripts/preregister-colonos.mjs` para
dar de alta en bloque desde un JSON, mismo shape que `adminCreateColono`.

**Gap conocido:** el envío de correo (usado por el flujo de auto-registro
dormido) depende de que la extensión oficial de Firebase *Trigger Email*
(o equivalente) esté instalada y escuchando la colección `mail`. Esa
extensión **no está declarada** en `firebase.json` — si el admin no ve
las notificaciones, ese es el primer lugar a revisar.

## Flujo de reservación

- `HomePage` muestra un recurso activo por tipo mediante el selector Cancha /
  Casa Club. `useCourtData()` encuentra el primer recurso activo cuyo `type`
  coincida; por ahora no hay un selector entre dos canchas (o dos casas club)
  activas del mismo tipo.
- Slots de horario se generan con `generateTimeSlots()` según
  `court.settings` (hora apertura/cierre, intervalo). Slots pasados (si es
  hoy) o que no alcanzan la duración mínima antes del cierre se ocultan.
- Al elegir un slot libre, `getAvailableDurations()` calcula qué duraciones
  caben sin chocar con otra reservación que "ocupe" el horario (ver abajo),
  topado en 2h (`MAX_RESERVATION_DURATION_HOURS`).
- **6 estados** (`ReservationStatus` en `src/types/index.ts`): `solicitada`
  (recién creada, pendiente de pago) → `pagada` (el tesorero confirmó el
  pago) → `cancelada` | `finalizada`; una reservación de Casa Club
  `finalizada` puede terminar además como `deposito-devuelto` o
  `deposito-retenido`, decidido por tesorero o admin. `solicitada` y
  `pagada` "ocupan" el horario (cuentan para traslapes y para los límites
  activos del usuario); los demás estados no ocupan — ver
  `OCCUPYING_STATUSES` y `canTransition()` en
  `src/services/reservationRules.ts`.
- **Expiración "lazy" del status** (issue 4/7 del épico #10 — decisión
  explícita por simplicidad, no por restricción de plan: el proyecto ya
  está en Blaze por `functions/`, pero corregir el status exacto al
  segundo seguiría necesitando una función programada aparte, y no vale la
  pena — "la próxima vez que alguien cargue la vista" es suficiente):
  una `solicitada` se libera (efectivamente `cancelada`) si
  nadie confirma el pago antes de `paymentDueAt`, calculado con
  `computePaymentDueAt()` — la fórmula depende del recurso (reportado y
  corregido 2026-09-12): cancha resta `paymentDeadlineHours` a `startAt`
  (antes del evento, default 12h); casa club se lo suma a `createdAt`
  (después de reservar, default 24h) — con su anticipación mínima de 72h,
  "antes del evento" dejaba semanas de margen para pagar aunque la
  reservación fuera para pronto. Una `solicitada` o
  `pagada` se vuelve efectivamente `finalizada` al pasar `endAt`. Nada
  corrige el campo `status` en Firestore en el instante exacto en que
  expira — `effectiveStatus(reservation, now)` en `reservationRules.ts`
  calcula el status real a partir del guardado + la hora actual, y
  `src/services/reservations.ts` la usa en **toda** lectura de
  reservaciones (para disponibilidad, conteos y lo que ve la UI) y además
  dispara, sin esperar, una escritura correctiva en Firestore cuando
  detecta que el status guardado quedó desactualizado — así el dato queda
  consistente para la siguiente persona que lea, sin depender de que sea
  la misma que lo dejó vencer. `firestore.rules` permite que *cualquier*
  usuario autenticado (no solo dueño/tesorero/admin) haga esas dos
  transiciones específicas, siempre que `request.time` (reloj del
  servidor) ya haya pasado `paymentDueAt`/`endAt`.
- `createReservation()` valida en cliente: horario dentro de rango, tope
  duro de 2h (independiente de `court.settings.maxDurationHours`, por si
  quedó una configuración vieja más permisiva), anticipación mínima
  (`minLeadHours`, default 24h) y máxima (`daysAheadAllowed`) — ambas contra
  `startAt`/`endAt` (`Timestamp`, calculados de `date`+`startTime`/`endTime`
  al crear), límite de reservaciones activas por usuario
  (`maxActiveReservationsPerUser`, default 2), y que no haya traslape de
  horario. **La mayoría de estas reglas se repiten en `firestore.rules`**
  (duración, ventana de anticipación, `paymentDueAt`, transición de status)
  porque las validaciones de cliente no son suficientes por sí solas:
  alguien podría escribir directo a Firestore. **Excepción:** el límite de
  activas y los traslapes NO se pueden validar en rules (requieren
  contar/leer otras reservaciones, no un `get()` puntual) — quedan solo del
  lado del cliente. Si cambias una regla de negocio, revisa `AGENTS.md` →
  "La regla más importante del repo" antes de asumir que basta un solo lado.
- Transiciones de status van por `cancelReservation()` (dueño/admin, →
  `cancelada`), `confirmPayment()` (tesorero/admin, `solicitada` →
  `pagada`) y `setReservationStatus()` (override libre, solo admin) en
  `src/services/reservations.ts`, más las dos transiciones automáticas de
  arriba. Quién puede hacer qué transición manual está centralizado en
  `canTransition()` (`src/services/reservationRules.ts`), espejo puro de la
  matriz en `firestore.rules`. Nunca se borra el
  documento (`allow delete: if false`).
- Al reservar, `BookingSheet` pide **cuántos jugadores en total** (1–10,
  `playerCount` — el máximo de 4 jugando a la vez en cancha es solo
  informativo en la UI, no se valida) y el **residente a cargo**
  (`residentInChargeName`, precargado con `profile.name` pero editable como
  texto libre, por si la usará alguien más del domicilio; no hay selector
  de usuarios registrados). Al confirmar, antes de cerrar el sheet, muestra
  el aviso de pago: monto (`court.settings.reservationFee`, default
  sugerido 300, editable por admin — issue 6/7) y fecha/hora límite
  (`paymentDueAt`, formateada con `formatDateTimeShort()` en
  `src/utils/time.ts`).
- `StatusBadge` (`src/components/StatusBadge.tsx`) centraliza texto y color
  de los seis estados, incluidos "Depósito devuelto" y "Depósito retenido".
  Las vistas de colono solo muestran reservaciones activas (`solicitada` /
  `pagada`); Configuración conserva el historial completo.
- Para **Casa Club** la reservación es de día completo. El sheet pide número
  de invitados (hasta el aforo configurado), muestra depósito y parte
  reembolsable, y al confirmar conserva el aviso de pago hasta que la persona
  lo cierre. También aplica su anticipación mínima, tope mensual por usuario
  y plazo de cancelación configurables; una cancelación fuera de ese plazo se
  rechaza. Cancha conserva horarios y selección de duración.

## Panel de administración (`/configuracion`)

Cuatro pestañas — la cuarta solo la ve `super-admin` (`AdminPage.tsx`,
`isSuperAdmin`/`tabs`; ver "Roles" arriba y Epic #43):
- **Reservaciones**: navega por fecha, ve **todas** las reservaciones del
  día de cualquier recurso (los 6 estados, con `StatusBadge` — incluye
  `deposito-devuelto`/`deposito-retenido`, exclusivos de casa club, ver
  Epic #60 — a diferencia de las vistas de colono, aquí no se filtra por
  status, ver `subscribeToAllReservationsByDate` en
  `src/services/reservations.ts`), puede cambiar el status de cualquiera a
  cualquier estado con un `<select>` (`setReservationStatus`, sin pasar
  por la matriz de transición normal — reforzado en rules: solo
  admin/super-admin).
  La acción **Reservar para un colono** permite a admin/super-admin activos
  buscar un colono activo por nombre o domicilio y reservar Cancha/Casa Club
  usando el mismo calendario y hoja de confirmación. El residente a cargo se
  precarga con el nombre del beneficiario y se puede editar. `createReservation`
  acepta `targetUserId` opcional, valida actor y beneficiario dentro de la
  transacción y aplica los límites al beneficiario. Nombre y domicilio se
  obtienen en el servidor; `createdByUid` registra al actor autenticado y es
  inmutable desde el cliente. El rate limit sigue contando por actor. La
  reservación nace `solicitada`, con los mismos plazos de pago y depósito.
- **Canchas** (issue 7/8 del Epic #60 generalizó esta pestaña, antes solo
  manejaba canchas de padel): activar/desactivar recursos, crear uno
  nuevo eligiendo tipo (Cancha/Casa Club — `createCourt(name, type)` en
  `src/services/courts.ts`), editar `CourtSettings` de cada uno. Los
  campos editables dependen del tipo (`AdminPage.tsx`, `CourtCard`):
  cancha muestra Horario y Duración permitida; casa club los oculta (es
  siempre día completo) y en su lugar muestra Depósito/Reembolsable,
  Plazo de cancelación y Aforo. Ambos tipos comparten la sección Reglas
  (reservaciones máximas por usuario, días de anticipación, anticipación
  mínima, plazo de pago, monto a pagar) — casa club agrega ahí Tope
  mensual por usuario.
- **Usuarios**: aprobar/rechazar pendientes, agregar colonos nuevos
  directamente (`adminCreateColono`). El rol de cada usuario se muestra
  aquí de **solo lectura** — asignarlo se movió a Avanzado (#38/#39).
- **Avanzado** (`AdvancedTab`, exclusivo de super-admin):
  - **Usuarios**: mismo listado que la pestaña Usuarios, pero con
    `RoleSelector` (asignar colono/admin/tesorero/super-admin —
    `canAssignRole` en `src/services/userRules.ts`, reforzado en
    `adminSetUserRole`, `functions/src/index.ts`) y un botón de eliminar
    por usuario (con confirmación inline, sin `window.confirm`) que llama
    a `adminDeleteColono` (`functions/src/index.ts`) — borra la cuenta de
    Auth, el doc de `users/{uid}`, y libera el cupo en
    `addresses/{key}`. Un super-admin no puede asignarse un rol distinto
    a sí mismo ni eliminarse a sí mismo (`canActOnUser` en
    `userRules.ts`, mismo check para ambas acciones — evita que el sitio
    se quede sin ningún super-admin, ya que no hay UI para asignar el rol
    de vuelta). Asignar rol pasa por Cloud Function (no un write directo
    a Firestore) porque además de actualizar el doc, setea un **custom
    claim** en el token de Auth (`request.auth.token.role`) — es lo que
    `storage.rules` usa para autorizar la subida de logo, en vez de leer
    Firestore directo (ver nota abajo). Los custom claims no llegan al
    cliente hasta el próximo refresh del ID token (cerrar/abrir sesión).
  - **Logo del sitio**: sube a Firebase Storage (`branding/logo`, ruta
    fija — ver `src/services/branding.ts` y `storage.rules`).
    `storage.rules` autoriza la escritura leyendo
    `request.auth.token.role` del custom claim, **no** `firestore.get()`
    — esa función (Cross Service Rules) requiere que Firestore y Storage
    estén en la misma ubicación, y este proyecto los tiene distintos
    (Firestore `nam5`, Storage `us-central1`); con `firestore.get()` la
    subida fallaba con `permission denied` en producción pese a que el
    rol fuera correcto. Ver "La regla más importante del repo" en
    AGENTS.md para el detalle completo.
  - **Color de acento**: paletas curadas (`src/theme/palettes.ts`),
    guardadas en `settings/theme`.
  - **Nombre del sitio y contacto**: `settings/general` (`siteName`,
    `whatsappUrl` opcional — ver `src/services/siteSettings.ts`).

## Vista de tesorero (`/pagos`)

Página chica y separada de Configuración a propósito (`TesoreroPage.tsx`) —
lista todas las reservaciones `solicitada` (pendientes de pago) de cualquier
fecha/recurso, ordenadas por `paymentDueAt` (las más urgentes primero), con
un botón "Confirmar pago" por reservación (`confirmPayment()`). Debajo
muestra "Depósitos por resolver" de Casa Club finalizada, con acciones para
devolver o retener la parte reembolsable. No hay paginación: el conjunto de
pendientes debería ser chico porque los pagos vencidos se liberan solos.

## Ayuda (`/ayuda`)

Tutorial + preguntas frecuentes por rol (`HelpPage.tsx`), accesible desde la
tab bar o sidebar de cualquier pantalla autenticada. El contenido es
**acumulativo según lo que
cada rol puede hacer de verdad en la app**, no solo su "función principal":
un admin ve la sección de reservar (puede hacerlo como cualquier colono),
la de confirmar pagos (tiene acceso a `/pagos`) y la de panel admin. Un
tesorero ve reservar + confirmar pagos. Un colono solo ve reservar. La
lógica vive en el arreglo `SECTIONS` dentro de `HelpPage.tsx` (cada
sección declara `visibleTo`) — es contenido estático en el cliente, no hay
CMS ni colección de Firestore para esto. Termina con un bloque fijo
apuntando al grupo de WhatsApp "Reservaciones - La Toscana" para dudas o
problemas que la ayuda no cubra.

## Calendario público (`/calendario`)

Única ruta pública del sitio — sin `ProtectedRoute`, sin sesión iniciada
(issue 8/8 del épico #60, ver PRD.md § 9 y § 11; nació exclusiva de casa
club y se generalizó a cancha después, mismo criterio de privacidad).
Pensada para compartirse como link directo en el grupo de WhatsApp o con
el guardia. `PublicCalendarPage.tsx`: selector Cancha/Casa Club (mismo
patrón que `HomePage`, siempre resuelve al único recurso activo de ese
tipo — hoy no hay más de una cancha, así que no hace falta elegir cuál),
grilla de mes (navegación anterior/siguiente) con los días que tienen
alguna reservación resaltados, más una lista debajo por reservación:
fecha + horario (cancha) o "Día completo" (casa club) + nombre del
residente a cargo + domicilio. A diferencia de casa club (máximo una
reservación por día), cancha puede tener varias el mismo día — la lista
se ordena por fecha y, dentro del día, por horario. Agrega `<meta
name="robots" content="noindex">` al `<head>` en un `useEffect` (se
quita al desmontar) — pública no implica indexable.

Los datos vienen de `getPublicCalendar` (Cloud Function `onCall`,
`functions/src/index.ts`), protegida solo por App Check — no requiere
`request.auth`, mismo patrón que `getResidentsByAddress`. Recibe
`{ year, month, courtType }`, ubica el recurso `type == courtType`, y
regresa únicamente `{ date, startTime, endTime, name, address }` por
reservación con status distinto de `cancelada`
(`isVisibleOnPublicCalendar()` en `functions/src/reservationRules.ts` —
a diferencia de `OCCUPYING_STATUSES`, también incluye
`finalizada`/`deposito-devuelto`/`deposito-retenido`, porque el evento sí
ocupó la fecha aunque ya se haya resuelto). Siempre incluye
`startTime`/`endTime` aunque casa club no los use para mostrar (son
siempre el mismo bloque de día completo) — el cliente decide qué mostrar
según `courtType`. **Nunca** se abre `firestore.rules` de `reservations`
a lectura pública para esto — expondría status de pago/depósito de
cualquier reservación a quien tenga el link.

## Aviso de privacidad (`/privacidad`)

Ruta pública, accesible también desde login, calendario público y Ayuda. Es
un aviso informativo, no una pantalla de consentimiento: Analytics se activa
automáticamente fuera de emuladores cuando el navegador es compatible.
Explica que se usan métricas agregadas de navegación e interacción (por
ejemplo, visitas a pantallas, desplazamientos y clics externos) para mejorar
el portal. Declara expresamente que no se envían nombres, teléfonos,
domicilios, correos, UID ni contenido o identificadores de reservaciones.

`src/services/analyticsRules.ts` restringe cualquier evento personalizado a
un catálogo y parámetros categóricos sin PII; `analytics.ts` aplica ese
filtro antes de `logEvent`. La instrumentación de los flujos de login y
reservación ya está conectada a la UI (issue #111, PR #117) — ver la
siguiente sección para cómo leerla.

## Métricas de Analytics: guía de revisión semanal (Epic #108, issue #112)

Propiedad de GA4: `padel-toscana` (measurement ID `G-225T8DENJV`, ver
`src/firebase.ts`). El catálogo de eventos es cerrado —
`src/services/analyticsRules.ts` es la fuente de verdad de qué existe y qué
parámetros acepta cada uno; ver "Aviso de privacidad" arriba para qué nunca
se envía.

**Dónde mirar** (dos vistas, propósitos distintos):
- **DebugView** (GA4 → Administrar → busca "DebugView" en el buscador
  superior) — stream evento por evento casi en tiempo real, filtrado a tu
  propio dispositivo (`gtag('set', {'debug_mode': true})` en la consola del
  navegador activa el modo debug para esa sesión). Sirve para *probar* que
  un evento nuevo dispara correctamente, no para la revisión semanal — no
  agrega histórico ni tasas.
- **Informes → Interacción → Eventos** — conteo agregado por nombre de
  evento, la fuente para la revisión semanal. **Los datos tardan hasta
  24-48h en aparecer aquí** (a diferencia de DebugView) — no esperes ver
  algo del mismo día.

**Cómo leer cada métrica** (todas se calculan dividiendo dos conteos del
reporte de Eventos, sin necesidad de armar una Exploración de embudo):

| Métrica | Qué responde | Evento(s) | Cálculo / filtro |
|---|---|---|---|
| Activación | ¿Cuánta gente que intenta entrar lo logra? | `login_started`, `login_completed` | `login_completed` (parámetro `result=success`) ÷ `login_started` |
| Abandono de login | ¿En qué paso se atora la gente? | `login_started` → `otp_sent` → `login_completed`, más `login_failed` | Caída entre esos tres conteos; `login_failed` desglosado por `error_code` (`address-not-found`, `rate-limited`, `invalid-phone`, `otp-failed`, `account-not-found`) dice la causa puntual |
| Conversión a reserva | ¿La gente que empieza a reservar, termina reservando? | `reservation_started`, `reservation_created` | `reservation_created` ÷ `reservation_started`, desglosado por `resource_type` (`cancha`/`casa_club`) |
| Cancelaciones | ¿Qué proporción de reservas se cancela? | `reservation_cancelled`, `reservation_created` | `reservation_cancelled` ÷ `reservation_created`, por `resource_type` |
| Errores | ¿Cuáles son los motivos de fallo más comunes? | `reservation_failed`, `login_failed` | Desglose por `error_code` — el catálogo completo está en `analyticsRules.ts` |
| Preferencia de recurso | ¿Cancha o Casa Club se usa más? | `resource_selected`, `reservation_created` | Conteo por `resource_type` |
| Pago a tiempo *(extra)* | ¿Se confirma el pago de lo reservado? | `reservation_created`, `payment_confirmed` | `payment_confirmed` ÷ `reservation_created`, por `resource_type` |
| Adopción del calendario público *(extra)* | ¿Se usa el link sin sesión? | `public_calendar_viewed` | Conteo total, por `resource_type` |

Ninguna de estas vistas necesita desglosar por usuario — el catálogo no
manda UID ni nombre (ver "Aviso de privacidad"), así que "por usuario" no
es una dimensión disponible ni buscada.

## Modelo de datos (Firestore)

| Colección | Documento | Notas |
|---|---|---|
| `users/{uid}` | `UserProfile` | `addressNormalized` = `"{street} {number}"` en minúsculas, usado como llave de `addresses`. |
| `addresses/{addressKey}` | `{ uids: string[] }` | Máximo 2 `uids`. Lectura pública (se usa antes de autenticar, para validar disponibilidad de domicilio en el registro). |
| `mail/{autoId}` | `{ to, message: { subject, html } }` | Solo creación por la app; lectura/actualización/borrado bloqueados — los procesa la extensión de correo. |
| `rateLimits/{uid}` | `{ windowStart: Timestamp, count: number }` | Rate limiting de `createReservation` (ventana fija, ver `functions/src/rateLimit.ts`). Solo la Cloud Function (Admin SDK) la toca — bloqueada por completo para el cliente en `firestore.rules`. |
| `lookupRateLimits/{ipHash}` | `{ windowStart: Timestamp, count: number }` | Rate limiting pre-auth de `getResidentsByAddress`: 10 consultas por IP cada 5 minutos. La IP se hashea con SHA-256 antes de usarla como id; el cliente no puede leer ni escribir esta colección. |
| `courts/{courtId}` | `Court` (incluye `CourtSettings`) | Lectura para cualquier usuario autenticado, escritura solo admin. `type?: 'cancha' \| 'casa-club'` (Epic #60, issue 1/8) discrimina el recurso — opcional para no requerir migración, `?? 'cancha'` como fallback en quien lo lea. `CourtSettings` tiene campos exclusivos de casa club (`depositAmount`, `depositRefundableAmount`, `cancellationDeadlineHours`, `maxReservationsPerUserPerMonth`) que quedan `undefined`/sin usar en cancha. |
| `settings/theme` | `{ paletteId: string }` | Paleta de acento activa (Epic #43, issue 5/5 — ver `src/theme/palettes.ts`). Lectura pública (se necesita antes de autenticar, en `/login`), escritura solo super-admin. Si no existe, se asume la paleta default (`'green'`). |
| `settings/general` | `{ siteName: string, whatsappUrl?: string }` | Nombre del sitio (Home/Login/RegisterPage y `document.title`) y link de contacto de WhatsApp (tarjeta al final de `HelpPage`). Mismas reglas que `settings/theme`: lectura pública, escritura solo super-admin. Si no existe o `whatsappUrl` está vacío, cae a los defaults/texto plano de siempre — ver `src/context/SiteSettingsContext.tsx`. |
| `reservations/{id}` | `Reservation` | Ver reglas de creación/actualización arriba. `startAt`/`endAt`/`paymentDueAt` son `Timestamp`; el resto de fecha/hora sigue siendo strings (`date`, `startTime`, `endTime`). `status` tiene 6 valores — además de los 4 originales, `deposito-devuelto`/`deposito-retenido` (exclusivos de casa club, issue 4/8) — y puede estar desactualizado, ver "Expiración lazy" arriba. `courtType?: CourtType` (issue 3/8) denormaliza el tipo de recurso al crear, mismo patrón/fallback que `Court.type`. `playerCount`/`residentInChargeName` capturados en `BookingSheet`. Índices compuestos en `firestore.indexes.json` para `courtId+date+status` y `userId+status+date` — siguen sirviendo con `where('status','in',[...])` porque Firestore indexa `in` igual que una igualdad. **Corregido 2026-09-12** (bug reportado: el calendario mensual de Casa Club no marcaba como ocupada una fecha con reservación real): se asumía que el prefijo `courtId+date` de ese índice de 3 campos también servía las queries por *rango* de fechas sin filtro de `status` (`subscribeToReservationsByDateRange`, `getPublicCalendar` — issue 8/8) "sin índice aparte" — **falso en producción**: Firestore exige un índice dedicado `courtId+date` (sin `status`) para ese patrón exacto (equality + range, sin la igualdad del tercer campo). El emulador de Firestore no valida índices, así que esto nunca falló en desarrollo local — solo en producción, silenciosamente (el error de Firestore no llegaba a mostrarse como algo obvio en la UI). Índice `courtId+date` agregado a `firestore.indexes.json`. El índice `date+status` que existía se quitó (issue 6/7): la única query que lo usaba (panel admin) ya no filtra por status. |

Los tipos TypeScript en `src/types/index.ts` son la fuente de verdad del
shape de estos documentos en el cliente.

## Autenticación y seguridad

- **Métodos**: teléfono (+52 México, OTP vía `RecaptchaVerifier` invisible)
  para todos; Google (popup) solo para el domicilio hardcodeado en
  `LoginPage.tsx` (`GOOGLE_LOGIN_ADDRESS`) — ver "Flujo de alta y login"
  arriba.
- **App Check** (`src/firebase.ts`) con reCAPTCHA v3 está siempre activo,
  incluso en dev — en local se apoya en el modo debug-token (ver README y
  AGENTS.md; para `npm run test:e2e` específicamente hace falta un debug
  token fijo vía `VITE_APPCHECK_DEBUG_TOKEN`, ver AGENTS.md). Las siete
  Cloud Functions (`createReservation`, `adminCreateColono`,
  `adminBulkCreateColonos`, `adminDeleteColono`, `adminSetUserRole`,
  `getResidentsByAddress`, `getPublicCalendar`) tienen `enforceAppCheck: true`.
- La autorización real vive en `firestore.rules`; el cliente nunca debe ser la
  única línea de defensa para nada sensible (roles, límites, integridad de
  reservaciones).

## Gaps / deuda conocida (útil antes de asumir que "ya existe")

- Casi toda la lógica vive en el cliente + reglas de Firestore. Las
  excepciones son las siete funciones en `functions/` (Cloud Functions
  v2): `createReservation` (existe porque crear una reservación necesita
  validar el límite de activas por usuario y traslapes de horario, algo
  que requiere queries agregadas que `firestore.rules` no puede hacer —
  solo `get()` de documentos puntuales; corre esa validación + el write
  dentro de una transacción atómica; `firestore.rules` deniega `create` en
  `reservations` por completo, `if false` — la función es la única vía),
  `adminCreateColono`/`adminBulkCreateColonos`/`adminDeleteColono`/`adminSetUserRole` (necesitan
  Admin SDK para crear/eliminar cuentas de Auth ajenas y setear custom
  claims), y `getResidentsByAddress`/`getPublicCalendar` (ambas leen
  Firestore pre-auth con Admin SDK — la primera para el saludo de login,
  la segunda para el calendario público de cancha/casa club, ver sección
  dedicada arriba). El proyecto está en plan Blaze por esto. Ver "La
  regla más importante del repo" en AGENTS.md.
- Hay tests unitarios (Vitest — `npm run test` para el cliente,
  `npm run test:functions` para `functions/`) para toda la lógica de
  negocio pura, tests de componentes (Testing Library, ej. `BookingSheet`,
  `StatusBadge`) y cuatro flujos E2E con Playwright (`npm run test:e2e`, contra
  emuladores): cancha (alta → login → reserva → pago → cancelación), Casa
  Club (depósito → pago → finalización → devolución → cancelación),
  navegación responsive (tab bar móvil/sidebar de tableta) y reserva por
  administración (beneficiario, autoría protegida, cancelación y rechazo
  de suplantación).
- Un super-admin autenticado puede cambiar el `role` de **cualquier**
  usuario, incluido el suyo propio, directo contra Firestore (la rama
  `isSuperAdmin()` de `allow update` en `users/{uid}` no distingue
  target) — saltándose así `adminSetUserRole` (`functions/src/index.ts`,
  el camino normal desde la UI). El doc quedaría correcto pero el
  **custom claim del token no se actualizaría** (solo `adminSetUserRole`
  lo setea), dejando `storage.rules` con un rol desincronizado hasta que
  alguien vuelva a llamar esa función para ese uid. La restricción de "no
  puedes cambiar/eliminar tu propia cuenta" solo existe en la UI
  (`canActOnUser` en `src/services/userRules.ts`) y en
  `adminSetUserRole`/`adminDeleteColono` (si se llaman directo, sí
  reforzado server-side), no en `firestore.rules` para el caso de
  cambiar rol. Admin normal ya no puede tocar `role` en absoluto (ver
  Epic #43, issue #38).
- La extensión de correo (`mail` collection) no está declarada en
  `firebase.json` — confirmar que esté instalada en el proyecto real antes de
  depender de las notificaciones por email.
- `useCourtData` elige el primer recurso activo de cada tipo; la UI todavía
  no lista varias canchas ni varias casas club activas simultáneamente.
