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

*Actualización (2026-08-29, ver tarea 4 abajo): con el alta de colonos por
admin, Google Sign-In quedó acotado a una excepción hardcodeada en
`LoginPage.tsx` (`GOOGLE_LOGIN_ADDRESS = 'nogal 35'`) — solo la cuenta admin
original (que predata el modelo de alta por admin) puede usarlo; para
cualquier otro domicilio ya no aparece el botón. Esta tarea ahora se reduce
a migrar esa única cuenta a teléfono (o a correo, si se implementa la tarea
4) y quitar la excepción — mucho más chico que el alcance original.*

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

## 3. Prevenir abuso de la API (mantener el costo cerca de $0 en plan Blaze)

El proyecto pasó a plan Blaze (de pago) para poder tener la Cloud Function
`createReservation` (ver tarea de traslapes/límite de reservaciones, ya
cerrada). Con esto, varias cosas que antes no costaban nada ahora sí tienen
un costo real, aunque pequeño — y hoy no hay ninguna protección puesta
específicamente contra abuso/spam:

- **Envío de OTP por SMS** (`sendPhoneOtp` en `LoginPage.tsx`, tanto modo
  "Registrarme" como "Ya tengo cuenta") **no requiere estar autenticado** —
  cualquiera que entre a `/login` puede mandar SMS a cualquier número. Cada
  verificación de teléfono tiene un costo real en Firebase Auth. El único
  freno que existe hoy es el `resendTimer` de 60s, que es solo del lado del
  cliente (no protege contra un script que pegue directo al SDK/API).
- **`createReservation`** (la Cloud Function) no tiene `enforceAppCheck`
  activado — quedó fuera de alcance en el PR que la introdujo por
  fricción no comprobada con el flujo de debug-token del emulador (ver
  nota en AGENTS.md). Cualquiera con un token de Auth válido (cualquier
  colono activo, o alguien que se registre) puede llamarla tantas veces
  como quiera.
- `firestore.rules` da lectura amplia (`allow read: if isAuthenticated()`)
  en varias colecciones — un usuario autenticado podría hacer muchas
  lecturas si algo (o alguien) lo scriptea.

Candidatos, de más simple/barato a más trabajo:
- ~~**Budget alert en GCP Billing** para el proyecto~~ — **hecho** (2026-08-29,
  fuera del repo, vía `gcloud`). Ya existía un budget default de $40 MXN/mes
  (creado por Firebase al dar de alta el proyecto) con umbrales en 50/90/100%
  del gasto actual; se le agregó un canal de notificación de email
  (`ernesto.sanchez.kuri@gmail.com`) porque antes solo notificaba a los
  destinatarios default de IAM de la cuenta de facturación. No se tocó el
  monto. Configuración en
  `billingAccounts/016CBD-CA33C1-2510D9/budgets/277cb204-d029-4b8c-94b2-995c097086e5`.
- ~~Activar `enforceAppCheck: true` en `createReservation`~~ — **hecho en
  código y desplegado a producción** (2026-08-29, `functions/src/index.ts`
  + `firebase deploy --only functions`). Se probó contra el emulador de
  Functions con un debug token real (creado/canjeado/borrado vía la API
  de `firebaseappcheck.googleapis.com`, ver nota nueva en AGENTS.md): sin
  App Check token la función responde `Unauthenticated`; con un Auth
  token válido pero sin App Check token, también `Unauthenticated`; con
  ambos, pasa el gate y llega a la validación de negocio normal
  (`invalid-argument` por payload vacío). El cliente ya manda el token de
  App Check automáticamente en cada llamada (`initializeAppCheck` en
  `src/firebase.ts`, siempre activo). *Pendiente: nadie ha confirmado
  todavía una reservación real de punta a punta en producción después
  del deploy — probable que funcione (el gate se probó equivalente en
  emulador) pero no verificado directamente.*
- ~~Activar App Check enforcement para Firebase Authentication/Identity
  Platform~~ — **hecho** (2026-08-29, `enforcementMode: ENFORCED` para
  `identitytoolkit.googleapis.com`, vía API de
  `firebaseappcheck.googleapis.com`). Antes de activarlo se confirmó
  manualmente que el flujo real de envío de OTP por teléfono en
  producción sí manda el header `X-Firebase-AppCheck` (probado por el
  usuario en `padel-toscana.web.app`, DevTools → Network). Métricas de
  los 30 días previos (agregadas a nivel proyecto, no solo Auth — la API
  de Cloud Monitoring no desglosa por servicio): ~97% de verificaciones
  `VALID`. *Pendiente: monitorear las métricas de App Check
  (`firebaseappcheck.googleapis.com/services/verification_count`,
  desglosado por `security`) los próximos días para confirmar que no hay
  colonos reales bloqueados — si algo se rompe, revertir es inmediato
  (`enforcementMode: UNENFORCED`).*
- ~~Rate limiting explícito dentro de `createReservation`~~ — **hecho en
  código y desplegado a producción** (2026-08-29,
  `functions/src/rateLimit.ts` + `functions/src/index.ts`,
  `firestore.rules`). Ventana fija: máximo 10 llamadas por uid cada 5
  minutos. Probado contra el emulador de Functions (Auth + App Check
  debug token reales): la llamada 11 dentro de la ventana responde
  `resource-exhausted`. Verificado en producción bajando el zip
  desplegado de Cloud Storage y confirmando que trae el código nuevo, y
  leyendo el ruleset activo de Firestore para confirmar el bloque
  `rateLimits/{uid}`.

  *Nota para el próximo deploy de functions:* `firebase deploy --only
  functions` (todo el codebase) puede reportar `Skipped (No changes
  detected)` con un hash que no refleja cambios reales aunque sí los
  haya — pasó en este deploy. Si eso ocurre, usar `--only
  functions:<nombreDeLaFunción>` (target explícito) fuerza el redeploy
  sin pasar por esa comparación de hash. Confirmar siempre con `gcloud
  functions describe <nombre> --gen2 --format="value(updateTime)"` que
  el `updateTime` avanzó después de un deploy.

Con esto, los 4 candidatos de la tarea 3 están hechos y desplegados.
Queda pendiente solo el monitoreo continuo (métricas de App Check para
Auth, ver nota arriba) — no hay más trabajo de código identificado para
esta tarea por ahora.

## 4. Follow-ups del alta de colonos por admin (2026-08-29)

Contexto: se reemplazó el auto-registro como punto de entrada — el admin da
de alta a los colonos (nombre, calle, número, teléfono) desde el panel de
Admin (`adminCreateColono`, `functions/src/index.ts`), y `LoginPage.tsx`
ahora es domicilio → saludo por nombre (`getResidentsByAddress`) → teléfono
→ OTP, sin más tab de "Registrarme". `RegisterPage.tsx`/`registerUser()`/el
flujo de aprobar-rechazar siguen intactos en el código, solo sin punto de
entrada. Detalles completos en el PR que cierra esta tarea.

Quedaron dos cosas fuera de alcance a propósito, documentadas aquí para no
perderlas:

- **Correo como método de acceso**: la tarea original pedía "teléfono y/o
  correo" para el alta, pero se implementó solo teléfono — no existe hoy
  ningún método de login por correo sin contraseña. Si se necesita, la
  opción más simple es un magic link (Firebase Email Link), que puede
  reusar la extensión de correo (Trigger Email) que ya está en el proyecto
  para notificaciones — no requiere agregar infraestructura nueva.
- **Rate limiting en `getResidentsByAddress`**: es el único callable de
  toda la app que no requiere `request.auth` (corre antes de que la persona
  entre) — funcionalmente es un oráculo de "¿existe este domicilio?". Hoy
  solo está protegido por `enforceAppCheck`. El costo de un abuso ahí es
  bajo (una lectura de Firestore, no SMS), así que no se consideró
  bloqueante, pero si se quiere cerrar del todo: reusar `checkRateLimit` de
  `functions/src/rateLimit.ts`, con una llave nueva (no hay `uid` pre-auth
  — usar IP del caller, `request.rawRequest.ip`) y una colección
  `lookupRateLimits/{ip}` separada de `rateLimits/{uid}` para no mezclar
  esquemas de llave.

También queda pendiente, no crítico: reconstruir el helper `registerWithPhone`
en `e2e/helpers.ts` (se quitó — automatizar el flujo dormido de
auto-registro ahora requeriría autenticar contra el emulador sin pasar por
`/login`, ver nota en ese archivo) si el auto-registro se reactiva como
entrada real algún día.

