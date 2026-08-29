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
| **`tesorero`** | Confirma que una reservación ya fue pagada (issue 7/7 del épico #10 — aún no implementado en la UI a esta fecha). |

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
  (1h/2h/3h) caben sin chocar con otra reservación activa.
- `createReservation()` valida en cliente: horario dentro de rango, límite
  de reservaciones activas por usuario (`maxActiveReservationsPerUser`,
  default 1), y que no haya traslape de horario. **Estas mismas reglas se
  repiten en `firestore.rules`** porque las validaciones de cliente no son
  suficientes por sí solas: alguien podría escribir directo a Firestore. Si
  cambias una regla de negocio (p. ej. permitir reservaciones traslapadas,
  cambiar el límite), debes actualizar **ambos lados**.
- Cancelar una reservación (`cancelReservation`) es un soft-delete: cambia
  `status` a `cancelled`, nunca se borra el documento (`allow delete: if
  false` en las rules).

## Panel de administración (`/admin`)

Tres pestañas:
- **Reservaciones**: navega por fecha, ve todas las reservaciones activas del
  día, puede cancelar cualquiera.
- **Canchas**: activar/desactivar canchas, editar `CourtSettings` (horario,
  duración mín/máx, reservaciones máximas por usuario, días de anticipación
  permitidos), crear canchas nuevas.
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
| `reservations/{id}` | `Reservation` | Ver reglas de creación/actualización arriba. Índices compuestos en `firestore.indexes.json` para las queries por `date+status`, `courtId+date+status`, `userId+status+date`. |

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
