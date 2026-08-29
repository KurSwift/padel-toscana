# Tareas pendientes

Backlog de tareas identificadas pero no planeadas/implementadas todavía.
No es un roadmap con fechas — es una lista de candidatos a convertirse en
issues de GitHub cuando se prioricen. Cada una, al implementarse, sigue el
flujo normal del repo: su propio branch + PR (ver AGENTS.md).

## 1. Validar límite de reservaciones activas y traslapes en `firestore.rules`

Hoy (ver "Excepción conocida" en AGENTS.md → "La regla más importante del
repo") el límite de reservaciones activas por usuario
(`maxActiveReservationsPerUser`) y la detección de traslapes de horario
(`hasOverlap`) solo se validan en `src/services/reservations.ts` — el
cliente. `firestore.rules` no puede hacerlo con un simple `get()` porque
requiere contar/leer todas las demás reservaciones de un usuario o cancha
en el momento de escribir. Un cliente que escriba directo a Firestore
(saltándose la app) podría crear reservaciones traslapadas o exceder el
límite.

Para cerrar esto de verdad hace falta una de dos cosas:
- Cloud Functions (subir a plan Blaze) con una validación server-side al
  crear, o
- Transacciones Firestore más estrictas del lado del cliente (no elimina
  el gap para un cliente malicioso, pero reduce condiciones de carrera
  entre usuarios legítimos).

## 2. Eliminar autenticación por correo

Quitar el inicio de sesión con Google (`signInWithGoogle()` en
`src/services/auth.ts`, botón correspondiente en `LoginPage.tsx`) y dejar
solo teléfono +52 vía OTP como método de autenticación.

*Nota: el repo no tiene un método de "correo" separado (email/password o
email-link) — el único método ligado a un correo hoy es Google Sign-In,
ya que la cuenta de Google es un email. Asumo que es a esto a lo que se
refiere la tarea; confirmar antes de implementar. Si se elimina, también
hay que decidir qué pasa con usuarios existentes que se registraron con
Google (su `UserProfile.email` pero sin `phone`) — no podrían volver a
entrar sin agregarles un teléfono primero.*

## 3. Pre-registro de usuarios por CSV (script, no en UI)

Script tipo `scripts/seed.mjs` (pero para producción, con el mismo patrón
de seguridad que `scripts/push-to-prod.mjs` / `migrate-users-role.mjs`:
dry-run por default, `--confirm` explícito) que lea un CSV de colonos
(nombre, calle, número, teléfono) y cree sus `users/{uid}` + entradas en
`addresses/` directamente en producción, sin pasar por el flujo de
registro/aprobación manual de la app. Pensado para dar de alta en bloque a
los colonos existentes al lanzar el reglamento nuevo, no como reemplazo
del registro normal.

Puntos a definir antes de implementar:
- ¿De dónde sale el `uid`? Si el usuario no tiene cuenta de Firebase Auth
  todavía, hay que crearla también (como hace `seedAuthUsers()` en
  `seed.mjs`, pero contra Auth de producción) — probablemente por
  teléfono, ya que sería el método de login que quede tras la tarea 2.
- ¿Qué `status` y `role` llevan estos usuarios al crearse? (`active` /
  `colono` por default, asumo).
- Formato exacto del CSV y validaciones (calle debe ser una de
  `VALID_STREETS`, máximo 2 por domicilio, etc. — mismas reglas que
  `registerUser()`).

## 4. Tests de componentes/E2E

Hoy `npm run test` (Vitest) solo cubre lógica de negocio pura
(`reservationRules.ts`, `userRules.ts`, `utils/time.ts`) — no hay tests
que rendericen componentes React ni que ejerciten flujos completos
(registro, reservar, cancelar, confirmar pago) contra el emulador.
Candidatos:
- Testing Library (`@testing-library/react`) + Vitest para tests de
  componentes aislados (ej. `BookingSheet`, `StatusBadge`).
- Playwright (ya se usó ad-hoc para verificación manual en este repo, ver
  historial de conversación) para 2-3 flujos E2E críticos contra el
  emulador: registro → aprobación → reservar → pagar → cancelar.
