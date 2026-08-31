# Contexto del proyecto — Padel Toscana

Este documento explica el **dominio de negocio** y las reglas que gobiernan la
app, para que cualquier persona (o agente) que llegue al repo entienda el
"por qué" detrás del código, no solo el "qué".

## Qué es esto

Padel Toscana es una **app privada de reservación de canchas de pádel** para
los residentes de un fraccionamiento llamado "Toscana", compuesto por
exactamente tres calles:

```
Nogal · Olivo · Encino
```

(ver `VALID_STREETS` en `src/types/index.ts`). No es una app pública — solo
personas que viven en una de esas calles pueden solicitar acceso, y cada
solicitud debe ser aprobada manualmente por un administrador.

## Roles

Cuatro roles, en `UserProfile.role` (`src/types/index.ts`):

| Rol | Descripción |
|---|---|
| **`colono`** | Puede reservar/cancelar sus propias reservaciones una vez aprobado. Rol por default al registrarse. |
| **`admin`** | Aprueba/rechaza registros, gestiona canchas (horarios, reglas), ve y cancela cualquier reservación. Ya no cambia el rol de otros usuarios — eso quedó exclusivo de `super-admin` (ver abajo). |
| **`tesorero`** | Confirma que una reservación `solicitada` ya fue pagada, desde `/tesorero` (`TesoreroPage.tsx`) — lista todas las `solicitada` pendientes (cualquier fecha/cancha) con un botón "Confirmar pago" (`confirmPayment()`). Un admin/super-admin también puede entrar a esa ruta. |
| **`super-admin`** | Superset de `admin` — entra a `/admin` con las mismas capacidades, más asignar el rol de cualquier otro usuario y eliminar cuentas (exclusivo suyo, ver `canAssignRole()`/`canActOnUser()` en `src/services/userRules.ts`, `adminSetUserRole`/`adminDeleteColono` en `functions/src/index.ts`, e `isSuperAdmin()` en `firestore.rules`). Se asigna a mano en Firestore (bootstrap) o vía `adminSetUserRole` si ya hay otro super-admin — no hay UI de auto-promoción para el primero. |

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
que `admin`. Todo vive en `/admin` → pestaña "Avanzado" (`AdvancedTab` en
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

## Flujo de alta y login (actualizado 2026-08-30 — reemplaza el auto-registro)

Desde el alta de colonos por admin (ver Epic
[#33](https://github.com/KurSwift/padel-toscana/pull/33)), ya no hay
auto-registro por default. El flujo real:

1. **Alta**: un admin (o `super-admin` — ver "Roles" arriba) va a
   `/admin` → Usuarios → "+ Agregar colono", captura
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
   teléfono +52 vía OTP (Firebase Auth). Si nadie está registrado en ese
   domicilio, error — no hay fallback a auto-registro.
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

- `HomePage` muestra una sola cancha activa (`getActiveCourts()[0]` en
  `useCourtData.ts` — **asume una sola cancha activa**; si se activan varias,
  solo se usa la primera que devuelva Firestore).
- Slots de horario se generan con `generateTimeSlots()` según
  `court.settings` (hora apertura/cierre, intervalo). Slots pasados (si es
  hoy) o que no alcanzan la duración mínima antes del cierre se ocultan.
- Al elegir un slot libre, `getAvailableDurations()` calcula qué duraciones
  caben sin chocar con otra reservación que "ocupe" el horario (ver abajo),
  topado en 2h (`MAX_RESERVATION_DURATION_HOURS`).
- **4 estados** (`ReservationStatus` en `src/types/index.ts`): `solicitada`
  (recién creada, pendiente de pago) → `pagada` (el tesorero confirmó el
  pago) → `cancelada` | `finalizada`. `solicitada` y `pagada` "ocupan" el
  horario (cuentan para traslapes y para el límite de reservaciones activas
  por usuario) — ver `OCCUPYING_STATUSES` en `src/services/reservationRules.ts`.
  `cancelada` y `finalizada` no ocupan.
- **Expiración "lazy" del status** (issue 4/7 del épico #10 — decisión
  explícita por simplicidad, no por restricción de plan: el proyecto ya
  está en Blaze por `functions/`, pero corregir el status exacto al
  segundo seguiría necesitando una función programada aparte, y no vale la
  pena — "la próxima vez que alguien cargue la vista" es suficiente):
  una `solicitada` se libera (efectivamente `cancelada`) si
  nadie confirma el pago antes de `paymentDueAt` (`startAt -
  court.settings.paymentDeadlineHours`, default 12h); una `solicitada` o
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
- `StatusBadge` (`src/components/StatusBadge.tsx`) centraliza el texto y
  color de los 4 estados ("Pendiente de pago", "Confirmada", "Cancelada",
  "Finalizada") — usado en `MyReservations` y en el bloque de "tu
  reservación" de `SlotsGrid`. En la práctica, como esas dos vistas solo
  reciben reservaciones cuyo status *efectivo* sigue ocupando el horario
  (ver expiración lazy arriba), en el día a día solo se ven ahí los badges
  de `solicitada`/`pagada` — `cancelada`/`finalizada` quedan listos para
  cuando el panel admin (issue 6/7) muestre historial completo.

## Panel de administración (`/admin`)

Cuatro pestañas — la cuarta solo la ve `super-admin` (`AdminPage.tsx`,
`isSuperAdmin`/`tabs`; ver "Roles" arriba y Epic #43):
- **Reservaciones**: navega por fecha, ve **todas** las reservaciones del
  día (los 4 estados, con `StatusBadge` — a diferencia de las vistas de
  colono, aquí no se filtra por status, ver
  `subscribeToAllReservationsByDate` en `src/services/reservations.ts`),
  puede cambiar el status de cualquiera a cualquier estado con un `<select>`
  (`setReservationStatus`, sin pasar por la matriz de transición normal —
  reforzado en rules: solo admin/super-admin).
- **Canchas**: activar/desactivar canchas, editar `CourtSettings` (horario,
  duración mín/máx, reservaciones máximas por usuario, días de anticipación,
  anticipación mínima, plazo de pago, monto a pagar), crear canchas nuevas.
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

## Vista de tesorero (`/tesorero`)

Página chica y separada de `/admin` a propósito (`TesoreroPage.tsx`) —
lista todas las reservaciones `solicitada` (pendientes de pago) de
cualquier fecha/cancha, ordenadas por `paymentDueAt` (las más urgentes
primero), con un botón "Confirmar pago" por reservación
(`confirmPayment()`). No hay paginación: el conjunto de `solicitada`
siempre debería ser chico porque expiran solas (issue 4/7) si nadie las
paga a tiempo.

## Ayuda (`/ayuda`)

Tutorial + preguntas frecuentes por rol (`HelpPage.tsx`), accesible desde
un botón "Ayuda" en la barra de cualquier pantalla autenticada (`HomePage`,
`AdminPage`, `TesoreroPage`). El contenido es **acumulativo según lo que
cada rol puede hacer de verdad en la app**, no solo su "función principal":
un admin ve la sección de reservar (puede hacerlo como cualquier colono),
la de confirmar pagos (tiene acceso a `/tesorero`) y la de panel admin. Un
tesorero ve reservar + confirmar pagos. Un colono solo ve reservar. La
lógica vive en el arreglo `SECTIONS` dentro de `HelpPage.tsx` (cada
sección declara `visibleTo`) — es contenido estático en el cliente, no hay
CMS ni colección de Firestore para esto. Termina con un bloque fijo
apuntando al grupo de WhatsApp "Reservaciones - La Toscana" para dudas o
problemas que la ayuda no cubra.

## Modelo de datos (Firestore)

| Colección | Documento | Notas |
|---|---|---|
| `users/{uid}` | `UserProfile` | `addressNormalized` = `"{street} {number}"` en minúsculas, usado como llave de `addresses`. |
| `addresses/{addressKey}` | `{ uids: string[] }` | Máximo 2 `uids`. Lectura pública (se usa antes de autenticar, para validar disponibilidad de domicilio en el registro). |
| `mail/{autoId}` | `{ to, message: { subject, html } }` | Solo creación por la app; lectura/actualización/borrado bloqueados — los procesa la extensión de correo. |
| `rateLimits/{uid}` | `{ windowStart: Timestamp, count: number }` | Rate limiting de `createReservation` (ventana fija, ver `functions/src/rateLimit.ts`). Solo la Cloud Function (Admin SDK) la toca — bloqueada por completo para el cliente en `firestore.rules`. |
| `courts/{courtId}` | `Court` (incluye `CourtSettings`) | Lectura para cualquier usuario autenticado, escritura solo admin. |
| `settings/theme` | `{ paletteId: string }` | Paleta de acento activa (Epic #43, issue 5/5 — ver `src/theme/palettes.ts`). Lectura pública (se necesita antes de autenticar, en `/login`), escritura solo super-admin. Si no existe, se asume la paleta default (`'green'`). |
| `settings/general` | `{ siteName: string, whatsappUrl?: string }` | Nombre del sitio (Home/Login/RegisterPage y `document.title`) y link de contacto de WhatsApp (tarjeta al final de `HelpPage`). Mismas reglas que `settings/theme`: lectura pública, escritura solo super-admin. Si no existe o `whatsappUrl` está vacío, cae a los defaults/texto plano de siempre — ver `src/context/SiteSettingsContext.tsx`. |
| `reservations/{id}` | `Reservation` | Ver reglas de creación/actualización arriba. `startAt`/`endAt`/`paymentDueAt` son `Timestamp`; el resto de fecha/hora sigue siendo strings (`date`, `startTime`, `endTime`). El campo `status` puede estar desactualizado — ver "Expiración lazy" arriba. `playerCount`/`residentInChargeName` capturados en `BookingSheet`. Índices compuestos en `firestore.indexes.json` para `courtId+date+status` y `userId+status+date` — siguen sirviendo con `where('status','in',[...])` porque Firestore indexa `in` igual que una igualdad. El índice `date+status` que existía se quitó (issue 6/7): la única query que lo usaba (panel admin) ya no filtra por status. |

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
  token fijo vía `VITE_APPCHECK_DEBUG_TOKEN`, ver AGENTS.md). Las tres
  Cloud Functions (`createReservation`, `adminCreateColono`,
  `getResidentsByAddress`) tienen `enforceAppCheck: true`.
- La autorización real vive en `firestore.rules`; el cliente nunca debe ser la
  única línea de defensa para nada sensible (roles, límites, integridad de
  reservaciones).

## Gaps / deuda conocida (útil antes de asumir que "ya existe")

- Casi toda la lógica vive en el cliente + reglas de Firestore. Las
  excepciones son las tres funciones en `functions/` (Cloud Functions v2):
  `createReservation` (existe porque crear una reservación necesita
  validar el límite de activas por usuario y traslapes de horario, algo
  que requiere queries agregadas que `firestore.rules` no puede hacer —
  solo `get()` de documentos puntuales; corre esa validación + el write
  dentro de una transacción atómica; `firestore.rules` deniega `create` en
  `reservations` por completo, `if false` — la función es la única vía),
  `adminCreateColono` y `getResidentsByAddress` (alta de colonos por
  admin — necesitan Admin SDK para crear cuentas de Auth ajenas y para
  consultar `users` antes de que la persona esté autenticada). El proyecto
  está en plan Blaze por esto. Ver "La regla más importante del repo" en
  AGENTS.md.
- Hay tests unitarios (Vitest — `npm run test` para el cliente,
  `npm run test:functions` para `functions/`) para toda la lógica de
  negocio pura, tests de componentes (Testing Library, ej. `BookingSheet`,
  `StatusBadge`) y un flujo E2E crítico con Playwright
  (`npm run test:e2e` — alta por admin → login → reserva → pago →
  cancelación, contra los emuladores).
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
- `useCourtData` asume una única cancha activa; la UI de `HomePage` no lista
  varias canchas aunque el modelo de datos sí lo soportaría.
