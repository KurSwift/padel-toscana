# Tareas pendientes

Backlog de tareas identificadas pero no planeadas/implementadas todavía.
No es un roadmap con fechas — es una lista de candidatos a convertirse en
issues de GitHub cuando se prioricen. Cada una, al implementarse, sigue el
flujo normal del repo: su propio branch + PR (ver AGENTS.md).

## 1. Eliminar autenticación por correo

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

## 2. Pre-registro de usuarios por CSV (script, no en UI)

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
  teléfono, ya que sería el método de login que quede tras la tarea 1.
- ¿Qué `status` y `role` llevan estos usuarios al crearse? (`active` /
  `colono` por default, asumo).
- Formato exacto del CSV y validaciones (calle debe ser una de
  `VALID_STREETS`, máximo 2 por domicilio, etc. — mismas reglas que
  `registerUser()`).

