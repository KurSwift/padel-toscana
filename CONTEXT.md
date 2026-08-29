# Contexto del proyecto — Padel Toscana

Este documento explica el **dominio de negocio** y las reglas que gobiernan la
app, para que cualquier persona (o agente) que llegue al repo entienda el
"por qué" detrás del código, no solo el "qué".

## Qué es esto

Padel Toscana es una **app privada de reservación de canchas de pádel** para
los residentes de un fraccionamiento llamado "Toscana", compuesto por
exactamente tres calles:

```
Nogal · Olivos · Encino
```

(ver `VALID_STREETS` en `src/types/index.ts`). No es una app pública — solo
personas que viven en una de esas calles pueden solicitar acceso, y cada
solicitud debe ser aprobada manualmente por un administrador.

## Roles

Tres roles, en `UserProfile.role` (`src/types/index.ts`):

| Rol | Descripción |
|---|---|
| **`colono`** | Puede reservar/cancelar sus propias reservaciones una vez aprobado. Rol por default al registrarse. |
| **`admin`** | Aprueba/rechaza registros, gestiona canchas (horarios, reglas), ve y cancela cualquier reservación, cambia el rol de otros usuarios. Se asigna manualmente desde el panel admin — no hay auto-promoción, y un admin no puede cambiarse su propio rol. |
| **`tesorero`** | Confirma que una reservación `solicitada` ya fue pagada, vía `confirmPayment()` en `src/services/reservations.ts` — la vista dedicada para hacerlo aún no existe (issue 7/7 del épico #10). |

Un usuario tiene además un `status`: `pending` → `active` → (o `rejected`).
Solo usuarios `active` pueden crear reservaciones. Los usuarios creados antes
de que existiera este campo se tratan como `active` por default (ver
`isActiveUser()` en `firestore.rules` y los fallbacks `?? 'active'` en la UI).

## Flujo de registro y aprobación

1. Usuario abre `/login`, elige modo **Registrarme**.
2. **Paso dirección**: elige calle + número. Se valida contra la colección
   `addresses` que no haya ya **2 usuarios** registrados en ese domicilio
   (`MAX_USERS_PER_ADDRESS` en `src/services/users.ts`). Este es el límite
   de "colonos por casa".
3. Se autentica con **Google** o **teléfono +52 vía OTP** (Firebase Auth).
4. Si no existe perfil (`users/{uid}`) → `/registro`, donde captura su
   nombre y confirma. `registerUser()` crea `users/{uid}` (status `pending`)
   y actualiza `addresses/{street numero}` en una transacción atómica, y
   además escribe un doc en `mail/` para notificar al admin por correo.
5. Mientras `status === 'pending'`, `ProtectedRoute` bloquea el acceso y
   muestra una pantalla de "solicitud en revisión".
6. Admin aprueba (`approveUser` → `status: 'active'`) o rechaza
   (`rejectUser` → borra el usuario y libera su lugar en `addresses` vía
   transacción).

**Gap conocido:** el envío de correo depende de que la extensión oficial de
Firebase *Trigger Email* (o equivalente) esté instalada y escuchando la
colección `mail`. Esa extensión **no está declarada** en `firebase.json` —
si el admin no ve las notificaciones, ese es el primer lugar a revisar.

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
  explícita: sin Cloud Functions, para quedarse en el plan Spark de
  Firebase): una `solicitada` se libera (efectivamente `cancelada`) si
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

Tres pestañas:
- **Reservaciones**: navega por fecha, ve **todas** las reservaciones del
  día (los 4 estados, con `StatusBadge` — a diferencia de las vistas de
  colono, aquí no se filtra por status, ver
  `subscribeToAllReservationsByDate` en `src/services/reservations.ts`),
  puede cambiar el status de cualquiera a cualquier estado con un `<select>`
  (`setReservationStatus`, sin pasar por la matriz de transición normal —
  reforzado en rules: solo admin).
- **Canchas**: activar/desactivar canchas, editar `CourtSettings` (horario,
  duración mín/máx, reservaciones máximas por usuario, días de anticipación,
  anticipación mínima, plazo de pago, monto a pagar), crear canchas nuevas.
- **Usuarios**: aprobar/rechazar pendientes, asignar rol (colono/admin/
  tesorero) vía un selector de 3 opciones. Un admin no puede modificarse su
  propio rol — bloqueado en la UI (`canChangeRole` en
  `src/services/userRules.ts`); las rules **no** repiten esta restricción
  específica (un admin autenticado puede escribir cualquier `users/*` vía
  API directa), mismo gap que existía con `isAdmin` antes de esta migración.

## Modelo de datos (Firestore)

| Colección | Documento | Notas |
|---|---|---|
| `users/{uid}` | `UserProfile` | `addressNormalized` = `"{street} {number}"` en minúsculas, usado como llave de `addresses`. |
| `addresses/{addressKey}` | `{ uids: string[] }` | Máximo 2 `uids`. Lectura pública (se usa antes de autenticar, para validar disponibilidad de domicilio en el registro). |
| `mail/{autoId}` | `{ to, message: { subject, html } }` | Solo creación por la app; lectura/actualización/borrado bloqueados — los procesa la extensión de correo. |
| `courts/{courtId}` | `Court` (incluye `CourtSettings`) | Lectura para cualquier usuario autenticado, escritura solo admin. |
| `reservations/{id}` | `Reservation` | Ver reglas de creación/actualización arriba. `startAt`/`endAt`/`paymentDueAt` son `Timestamp`; el resto de fecha/hora sigue siendo strings (`date`, `startTime`, `endTime`). El campo `status` puede estar desactualizado — ver "Expiración lazy" arriba. `playerCount`/`residentInChargeName` capturados en `BookingSheet`. Índices compuestos en `firestore.indexes.json` para `courtId+date+status` y `userId+status+date` — siguen sirviendo con `where('status','in',[...])` porque Firestore indexa `in` igual que una igualdad. El índice `date+status` que existía se quitó (issue 6/7): la única query que lo usaba (panel admin) ya no filtra por status. |

Los tipos TypeScript en `src/types/index.ts` son la fuente de verdad del
shape de estos documentos en el cliente.

## Autenticación y seguridad

- **Métodos**: Google (popup) y teléfono (+52 México, OTP vía
  `RecaptchaVerifier` invisible).
- **App Check** (`src/firebase.ts`) con reCAPTCHA v3 está siempre activo,
  incluso en dev — en local se apoya en el modo debug-token (ver README).
- La autorización real vive en `firestore.rules`; el cliente nunca debe ser la
  única línea de defensa para nada sensible (roles, límites, integridad de
  reservaciones).

## Gaps / deuda conocida (útil antes de asumir que "ya existe")

- No hay Cloud Functions en este repo; toda la lógica vive en el cliente +
  reglas de Firestore. Si se necesita lógica server-side confiable (p. ej.
  anti-doble-reserva 100% atómico), habría que introducir Functions o
  transacciones Firestore más estrictas.
- El límite de reservaciones activas por usuario y la detección de
  traslapes de horario solo se validan en el cliente
  (`src/services/reservations.ts`) — `firestore.rules` no puede hacer
  queries agregadas, solo `get()` de documentos puntuales. Un cliente que
  escriba directo a Firestore (saltándose la app) podría crear
  reservaciones traslapadas o exceder el límite. Mismo tipo de gap que el
  anti-doble-reserva atómico del punto anterior.
- Hay tests unitarios (Vitest, `npm run test`) para la lógica de negocio
  pura (`src/services/reservationRules.ts`, `src/services/userRules.ts`,
  `src/utils/time.ts`), pero no hay tests end-to-end ni de componentes.
- Un admin autenticado puede cambiar el `role` de **cualquier** usuario,
  incluido el suyo propio, directo contra Firestore — la restricción de "no
  puedes cambiar tu propio rol" solo existe en la UI (`canChangeRole`), no
  en `firestore.rules`.
- La extensión de correo (`mail` collection) no está declarada en
  `firebase.json` — confirmar que esté instalada en el proyecto real antes de
  depender de las notificaciones por email.
- `useCourtData` asume una única cancha activa; la UI de `HomePage` no lista
  varias canchas aunque el modelo de datos sí lo soportaría.
