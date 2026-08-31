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

## 2. ~~Pre-registro de usuarios por JSON (script, no en UI)~~ — hecho

**Hecho** (2026-08-30, `scripts/preregister-colonos.mjs`). Cambió de CSV a
JSON (`{ "colonos": [{ calle, numero_casa, nombre_completo, telefono,
email }] }` — ver `scripts/preregister-colonos.example.json`), decisión del
usuario. Mismo patrón de seguridad que `push-to-prod.mjs`/
`migrate-users-role.mjs`: dry-run por default, `--confirm` explícito,
`applicationDefault()` para credenciales de producción.

Decisiones tomadas (respondiendo los puntos que quedaban abiertos):
- `uid`: lo genera Firebase Auth al crear la cuenta (`auth.createUser({
  phoneNumber })`), mismo patrón que `adminCreateColono`
  (`functions/src/index.ts`) — el script es efectivamente una versión
  batch de esa función, mismo shape de `users/{uid}`/`addresses/{key}`.
- `status`/`role`: `active`/`colono` de inmediato, sin paso de aprobación —
  igual que el alta uno-por-uno desde AdminPage.
- `email` del JSON se guarda como dato en el perfil, no crea ningún método
  de acceso nuevo (login sigue siendo solo teléfono — ver tarea 4).
- Filas inválidas (calle fuera de `VALID_STREETS`, teléfono mal formado,
  nombre vacío, domicilio ya con 2 colonos) se omiten y se reportan al
  final — no abortan el archivo completo. Teléfonos que ya tienen cuenta
  se omiten silenciosamente — el script es seguro de correr más de una vez
  sobre el mismo archivo o uno ampliado.

Probado de punta a punta contra el emulador (no producción): alta exitosa,
re-corrida idempotente (omite duplicados), calle inválida, nombre inválido,
teléfono mal formado, domicilio lleno (2/2), y normalización de teléfono
con/sin prefijo `+52`/`52`.

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

## 5. Rol super-admin + panel avanzado (2026-08-30) — tracked en GitHub, no aquí

Planeado (branch/PR-per-issue) como issues de GitHub en vez de prosa en
este archivo — ver **Epic
[#43](https://github.com/KurSwift/padel-toscana/issues/43)**: nuevo rol
`super-admin` con un panel más avanzado en Admin (asignar roles — el
`admin` normal deja de poder hacerlo —, subir el logo del sitio, elegir
color de acento). Desglosado en 5 sub-issues en orden de dependencia
(#38 → #39 → #40 → #41/#42). Feature flags para super-admin quedó como
issue aparte, sin diseñar todavía ([#44](https://github.com/KurSwift/padel-toscana/issues/44)).

- ~~#38 — Rol super-admin: permisos base~~ — **hecho** (2026-08-30, ver
  detalle en "Roles" de CONTEXT.md): `UserRole` incluye `'super-admin'`,
  `isSuperAdmin()`/`isAdmin()` (superset) en `firestore.rules`,
  `canAssignRole()` en `src/services/userRules.ts`, `adminCreateColono`
  acepta ambos roles, `canTransition` y las rutas `/admin`/`/tesorero`
  incluyen a super-admin. `RoleSelector`/`handleChangeRole` se quitaron
  de `AdminPage.tsx` (UsersTab) — el rol ahora se muestra de solo
  lectura ahí; asignar rol queda sin UI hasta el issue #39. *Pendiente:
  el bootstrap del primer super-admin (promover la cuenta admin actual a
  mano en Firestore) sigue sin hacerse — hacerlo cuando se despliegue.*
- ~~#39 — Panel avanzado de super-admin (shell + asignar roles)~~ —
  **hecho** (2026-08-30): `AdminPage.tsx` gana la pestaña "Avanzado"
  (`Tab`/`tabs`), visible/seleccionable solo si `profile.role ===
  'super-admin'`. Nuevo componente `AdvancedTab` con la lista de usuarios
  activos + `RoleSelector` (el mismo control que se quitó de `UsersTab`
  en #38, reubicado aquí) — `handleChangeRole` re-chequea `canAssignRole`
  además de `canChangeRole` (defensa en profundidad, aunque el tab ya
  está gateado por rol a nivel de `AdminPage`). Sin lógica pura nueva —
  solo reusa `canAssignRole`/`canChangeRole` de #38.
- ~~#40 — Componente Header compartido (refactor, sin logo)~~ — **hecho**
  (2026-08-30): nuevo `src/components/Header.tsx` (`title`,
  `titleClassName`, `subtitle`, `sticky`, slot `logo`, `children` para
  acciones) consolidando el `<header>` que `HomePage`/`AdminPage`/
  `TesoreroPage`/`HelpPage` armaban cada una a mano. Refactor puro, sin
  cambio visual — cada página pasa el mismo título/clases/botones de
  antes. `LoginPage.tsx` quedó fuera (issue #41 la tocó).
- ~~#41 — Logo del sitio (Firebase Storage)~~ — **hecho** (2026-08-30):
  se scaffoldeó Storage desde cero — bloque `"storage"` en
  `firebase.json` + `storage.rules` nuevo (lectura pública, escritura
  solo `super-admin` vía `firestore.get()` cross-service; tipo/tamaño
  espejados en `src/services/brandingRules.ts`, testeado), `getStorage()`
  + `connectStorageEmulator` en `src/firebase.ts` (puerto `9199`).
  `src/services/branding.ts` (`uploadLogo`/`getLogoUrl`, ruta fija
  `branding/logo` sin extensión — el tipo real vive en el metadata
  `contentType` del objeto, así una subida nueva siempre sobreescribe la
  anterior sin dejar huérfanos). UI de subida (file input + preview +
  botón) en `AdvancedTab` (`AdminPage.tsx`, issue #39). Nuevo
  `src/components/Logo.tsx` (tamaños `sm`/`lg`) usado por defecto en
  `Header.tsx` (#40) y en `LoginPage.tsx` — sin logo subido, cae al
  badge "P" verde de siempre (ahí sí hubo cambio visual respecto a #40:
  ahora el navbar SÍ muestra el badge "P" por default, que #40 dejó
  vacío a propósito hasta que este issue decidiera el diseño real).
- ~~#42 — Color de acento (paletas predefinidas)~~ — **hecho**
  (2026-08-30): `src/theme/palettes.ts` — 7 paletas curadas (las escalas
  default de Tailwind, no hex inventados), cada una con sus 9 tonos,
  testeadas (`palettes.test.ts`: 9 tonos por paleta, ids únicos, default
  = verde). `tailwind.config.js` (`brand.{50..900}` → `var(--brand-*)`)
  + `src/index.css` (`:root` con los valores actuales — sin cambio
  visual hasta que alguien cambie de paleta). Doc `settings/theme`
  (`{ paletteId }`) en Firestore — `firestore.rules`: lectura pública
  (mismo criterio que `addresses`), escritura solo `isSuperAdmin()`.
  `src/context/ThemeContext.tsx` (mismo molde que `AuthContext`,
  `onSnapshot`, aplica los 9 `--brand-*` vía
  `document.documentElement.style.setProperty`), montado en `App.tsx`
  **fuera** de `AuthProvider` (el tema aplica incluso sin loguearse).
  Galería de swatches en `AdvancedTab` (`AdminPage.tsx`) →
  `setThemePalette()`. **Limitación conocida, no arreglada** (documentada
  también en CONTEXT.md): `manifest.json`, `theme-color` de `index.html`,
  `favicon.svg`, y los templates HTML de correo en `src/services/users.ts`
  se quedan en verde fijo.

**Epic #43 completo** — los 5 issues (#38–#42) están cerrados. Queda
pendiente solo el bootstrap del primer super-admin en producción
(promover la cuenta admin actual a mano en Firestore, ver nota en #38
arriba) y el feature flags de super-admin, sin diseñar todavía
([#44](https://github.com/KurSwift/padel-toscana/issues/44)).

### Extensión del panel Avanzado: nombre del sitio y contacto (2026-08-31)

No es parte de los 5 issues originales del Epic — pedida después de
cerrarlo, mismo lugar (`AdvancedTab`) y mismo patrón que logo/color.
**Hecho**: doc `settings/general` (`{ siteName: string, whatsappUrl?:
string }`) — reusa la regla genérica `settings/{docId}` que ya existía
(lectura pública, escritura solo super-admin), sin tocar
`firestore.rules`. `src/services/siteSettingsRules.ts` (`isValidSiteName`,
`isValidWhatsappUrl` — acepta `wa.me/...` o `chat.whatsapp.com/...`,
vacío es válido), testeado. `src/context/SiteSettingsContext.tsx` (mismo
molde que `ThemeContext`, montado en `App.tsx` fuera de `AuthProvider`) —
además fija `document.title` en runtime. Reemplaza el "Padel Toscana"
hardcodeado en `HomePage`/`LoginPage`/`RegisterPage`, y el texto plano de
contacto en `HelpPage` cae a un link real cuando hay `whatsappUrl`
configurado (si no, se ve igual que antes). UI de edición (dos inputs +
guardar) en `AdvancedTab`.

**Misma limitación conocida que el color** (no arreglada, documentada en
CONTEXT.md): `manifest.json`, los meta tags de `index.html`
(`<title>`, `apple-mobile-web-app-title`), y el subject/body del email
de nueva solicitud en `src/services/users.ts` se quedan con "Padel
Toscana" fijo — archivos estáticos o (en el caso del email) un flujo hoy
sin punto de entrada real (ver tarea 4 arriba), no valió la pena el
esfuerzo de conectarlo.

### Extensión del panel Avanzado: eliminar usuarios (2026-08-31)

Tampoco parte de los 5 issues originales — pedida después. Nueva Cloud
Function `adminDeleteColono` (`functions/src/index.ts`, mismo patrón que
`adminCreateColono`): borra la cuenta de Auth + el doc `users/{uid}` +
libera el cupo en `addresses/{key}`. **Exclusivo de super-admin** (a
diferencia de crear colonos, que admin normal también puede) — decisión
explícita del usuario, eliminar cuentas es más sensible que darlas de
alta.

`firestore.rules`: `allow delete` en `users/{uid}` se separó en dos
ramas — rechazar un `pending` sigue siendo cosa de cualquier admin (no
cambia, `rejectUser()` sigue igual), eliminar cualquier otro usuario es
exclusivo de `isSuperAdmin()`. Sin este cambio, un admin normal habría
podido saltarse la restricción llamando al SDK del cliente directo en
vez de pasar por la Cloud Function — la duplicación cliente/rules de
siempre (ver AGENTS.md).

`canChangeRole` en `src/services/userRules.ts` se renombró a
`canActOnUser` — la misma regla ("no puedes actuar sobre tu propia
cuenta") ahora protege tanto cambiar el propio rol como auto-eliminarse
(evita que el sitio se quede sin ningún super-admin, ya que no hay UI
para asignar el rol de vuelta). Mismo check duplicado en
`adminDeleteColono` del lado del servidor. Tests actualizados
(`userRules.test.ts`), sin lógica pura nueva más allá del rename.

UI: botón de eliminar (ícono de bote de basura) por usuario en la lista
de Avanzado, con confirmación inline de dos pasos (sin `window.confirm`
— el proyecto no usa diálogos nativos del navegador) antes de llamar a
la función.

Plan completo (contexto de la exploración, decisiones tomadas) en
`/Users/ernestosanchezkuri/.claude/plans/snug-percolating-feigenbaum.md`
si se retoma en una sesión sin ese historial de conversación.

