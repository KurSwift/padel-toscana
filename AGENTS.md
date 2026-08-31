# AGENTS.md

Guía técnica para agentes de código (y humanos) trabajando en este repo. Para
el contexto de negocio/dominio ver [CONTEXT.md](./CONTEXT.md).

## Stack

React 19 + TypeScript + Vite 6, Tailwind CSS 3, React Router 7, Firebase v11
(Auth, Firestore, Storage, App Check) vía SDK modular. Sin servidor propio: casi
toda la lógica de negocio vive en `src/services/*` y se refuerza en
`firestore.rules`. La excepción es `functions/` (Cloud Functions v2,
TypeScript) — tres funciones: `createReservation` (existe porque esa
validación requiere una query agregada que `firestore.rules` no puede
hacer — ver "La regla más importante del repo" más abajo), y
`adminCreateColono`/`getResidentsByAddress` (alta de colonos por admin —
crean cuentas de Auth ajenas y consultan `users` pre-auth, ambas cosas
requieren Admin SDK). El proyecto está en plan Blaze (de pago) por esto.

## Comandos

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo (Vite, http://localhost:5173)
npm run build       # tsc -b (type-check) + vite build → sale a public/
npm run preview     # sirve el build de producción localmente
npm run emulators   # Auth + Firestore + Functions + Storage emulators (requiere Java)
npm run seed        # prepobla el emulador con datos de ejemplo
npm run push-to-prod  # migra colecciones seleccionadas emulador → producción (dry-run por default)
npm run preregister-colonos -- --file=x.json  # alta en bloque de colonos en prod desde JSON (dry-run por default)
npm run test        # corre la suite de Vitest una vez (CI-friendly)
npm run test:watch  # Vitest en modo watch, para desarrollo
npm run test:e2e    # Playwright — flujo crítico E2E contra los emuladores (ver e2e/)
npm run test:functions    # Vitest de functions/ (reglas puras duplicadas — ver functions/src/reservationRules.ts)
npm run functions:build   # tsc de functions/ (predeploy hook también lo corre)
npm run functions:serve   # build + solo el emulador de Functions
npm run functions:deploy  # firebase deploy --only functions (requiere plan Blaze)
```

No hay lint script configurado en `package.json`. Los gates de calidad
automatizados son: el type-check que corre `tsc -b` como parte de
`npm run build` (strict mode, `noUnusedLocals`, `noUnusedParameters` activos
en `tsconfig.app.json`), y `npm run test` (Vitest) para la lógica de negocio
pura. Corre ambos antes de dar por terminado un cambio no trivial. Si el
cambio toca `functions/` (tiene su propio `package.json`/`tsconfig.json`,
build separado — no forma parte de `tsc -b` de la raíz), corre también
`npm run functions:build` y `npm run test:functions`.

`firebase-tools` y `firebase-admin` están como devDependencies (no hace
falta instalar nada global). El proyecto está enlazado vía `.firebaserc`
(`padel-toscana`) — si necesitas otro proyecto, `firebase use --add`.

`npm run test:e2e` (Playwright, `e2e/`) no es parte de los gates automáticos
de arriba — necesita los emuladores corriendo (`npm run emulators` +
`npm run seed`) y un `npm run dev` en paralelo (Playwright reusa uno ya
levantado en `:5173`, o levanta el suyo). Corre el único flujo crítico que
cubre hoy: alta de colono por admin → login (domicilio → saludo → teléfono
→ OTP) → reserva → confirmación de pago → cancelación, generando un
usuario/teléfono/domicilio nuevo en cada corrida para no depender de
cuántas reservaciones de ejemplo acumule ya el emulador (`npm run seed` no
es idempotente para `reservations`, ver "Emuladores, seeds y
push-to-prod" más abajo). `e2e/helpers.ts` automatiza `loginWithPhone`
(domicilio + teléfono, la única forma de entrar hoy — ver "Flujo de alta y
login" en CONTEXT.md) leyendo la OTP directo del endpoint de testing del
emulador de Auth (`/emulator/v1/projects/{id}/verificationCodes`) — no hay
SMS real que esperar. El flujo de auto-registro sigue en el código
(`RegisterPage.tsx`) pero sin punto de entrada desde `/login`, así que ya
no tiene helper de e2e propio (se quitó `registerWithPhone` — ver nota en
`e2e/helpers.ts` si hace falta reconstruirlo).

## Flujo de trabajo

- **Toda tarea nueva va en su propio branch** — nunca commits directos a
  `main`. Al terminar y verificar el cambio (`npm run build` limpio, feature
  probada), se abre un **Pull Request** para revisión, en vez de mergear
  directo.
- **Toda lógica de negocio nueva o modificada lleva tests de Vitest** antes
  de dar la tarea por terminada — no es opcional. Si la lógica no es pura
  (hace `await` a Firestore), extrae la parte de decisión/validación a una
  función pura testeable (ver "Lógica de negocio pura..." en Convenciones)
  y testea esa función; no dejes una validación de negocio sin cobertura
  solo porque vive dentro de una función async.
- **Toda PR incluye pasos de verificación manual en su descripción**,
  además del test plan automatizado (`npm run build`/`npm run test`) —
  sobre todo si el cambio toca UI, permisos/roles, o flujos que dependen de
  los emuladores. Formato: qué usuario/rol usar (de los que crea `npm run
  seed`), qué ruta o acción probar, y qué se espera ver. El objetivo es que
  quien revisa (o retoma la tarea después) pueda reproducir la verificación
  contra los emuladores sin tener que reconstruir el contexto desde cero.

## Estructura

```
src/
  firebase.ts          # init de app/auth/db/functions/storage/app-check — config está hardcodeada aquí
  App.tsx              # rutas (react-router)
  context/AuthContext   # user de Firebase Auth + su UserProfile (Firestore), vía onSnapshot
  context/ThemeContext   # paletteId activo (settings/theme en Firestore), vía onSnapshot — mismo molde que AuthContext
  context/SiteSettingsContext  # siteName/whatsappUrl (settings/general), mismo molde — también fija document.title
  components/           # UI reutilizable (Header, Logo, BookingSheet, SlotsGrid, DateSelector, StatusBadge, ProtectedRoute...)
  pages/                 # HomePage, AdminPage, TesoreroPage, HelpPage, LoginPage, RegisterPage
  services/              # única capa que toca Firestore/Auth/Storage directamente (auth, courts, reservations, users, branding, theme, siteSettings)
  theme/palettes.ts      # paletas de acento predefinidas (id, name, tones 50–900) — Epic #43, issue 5/5
  hooks/useCourtData     # combina cancha activa + reservaciones del día + reservaciones del usuario
  types/index.ts         # shapes de Firestore (UserProfile, Court, Reservation...) — fuente de verdad de tipos
  utils/time.ts          # helpers de fecha/hora en formato 'HH:mm' / 'YYYY-MM-DD' (strings, no Date en el modelo)
  services/reservationRules.ts  # lógica pura de reservaciones (sin imports de firebase/*), testeada con Vitest
  services/userRules.ts   # lógica pura de roles/permisos (mismo patrón), testeada con Vitest
  services/brandingRules.ts  # lógica pura de validación del logo del sitio (mismo patrón), testeada con Vitest
  services/siteSettingsRules.ts  # lógica pura de validación de nombre/link de WhatsApp (mismo patrón), testeada con Vitest
scripts/
  seed.mjs                    # prepobla el emulador (firebase-admin, nunca toca producción)
  push-to-prod.mjs             # migra colecciones seleccionadas emulador → producción
  migrate-users-role.mjs       # one-off: isAdmin (bool) → role (string) en usuarios existentes de prod
  preregister-colonos.mjs      # alta en bloque de colonos en prod desde un JSON (dry-run por default)
e2e/                      # Playwright — npm run test:e2e, ver más abajo
  helpers.ts              # loginWithPhone (domicilio + teléfono + OTP vía emulador), logout
  critical-flow.spec.ts   # alta por admin → login → reserva → pago → cancelación
functions/                # Cloud Functions v2 + TypeScript — build/deploy propios, ver "Comandos"
  src/index.ts             # createReservation, adminCreateColono, getResidentsByAddress (onCall)
  src/reservationRules.ts  # copia de la lógica pura que necesita (ver comentario de cabecera)
  src/colonoRules.ts        # lógica pura de alta de colonos (calle válida, cupo, teléfono) — sin mirror en src/
  src/rateLimit.ts           # rate limiting genérico (ventana fija), usado por createReservation
  src/time.ts               # copia de src/utils/time.ts (toDate/addHours) — mismo motivo
```

Alias de import: `@/` → `src/` (configurado en `vite.config.ts` y
`tsconfig.app.json`). Usa siempre `@/...`, no rutas relativas largas.

## Convenciones de código

- **Componentes funcionales** con hooks; sin clases. Un componente por
  archivo salvo sub-componentes privados de una página (ej. `CourtCard`,
  `Spinner` dentro de `AdminPage.tsx`).
- **Nada de `any`** salvo casos ya existentes muy puntuales
  (`self as any` para el flag de debug de App Check); castea con
  `as Tipo` cuando conviertes snapshots de Firestore a los tipos de
  `src/types`.
- **Fechas y horas son strings**, no objetos `Date`, en todo el modelo de
  datos y las props (`date: 'YYYY-MM-DD'`, `startTime/endTime: 'HH:mm'`).
  Todas las conversiones pasan por `src/utils/time.ts` — no reinventes
  parsing de fechas en un componente.
- **Servicios (`src/services/*`) son la única capa que importa `firebase/*`**
  para leer/escribir datos. Los componentes y páginas llaman funciones de
  servicios, nunca `db`/`collection`/`doc` directamente.
- **Errores de negocio se comunican por código de string** (`throw new
  Error('slot-taken')`, `'max-reservations'`, `'address-full'`) y se
  traducen a mensajes de usuario en un mapa (`reservationErrorMessage`,
  `ERROR_MESSAGES` en `LoginPage.tsx`). Sigue ese patrón al agregar nuevas
  validaciones en vez de mostrar `err.message` crudo.
- **Toasts** (`react-hot-toast`) para feedback de acciones, no `alert`.
- **Textos de UI en español** (es el idioma de toda la app, incluyendo
  mensajes de error) — no mezclar inglés en copy visible al usuario.
- **Tailwind** con la paleta custom `brand` (verde, ver
  `tailwind.config.js`) — usa `brand-*` para acentos de marca en vez de
  `green-*` de Tailwind por defecto, para mantener consistencia.
- **Lógica de negocio pura (sin efectos secundarios de Firestore) va en
  archivos separados** de los servicios que hacen I/O — ver
  `src/services/reservationRules.ts` como ejemplo (`hasOverlap`,
  `countOccupyingReservations`). Esto permite testearla con Vitest sin
  inicializar Firebase/App Check. Al agregar una validación de negocio
  nueva, prefiere extraerla como función pura ahí (o en un archivo similar)
  en vez de dejarla inline dentro de una función que también hace `await`
  a Firestore.
- **Documenta cada función nueva** (qué recibe, qué hace, qué devuelve, y
  cualquier efecto secundario o invariante no obvio — p. ej. que valida
  contra `firestore.rules`, que es parte de una transacción, etc.) con un
  comentario breve arriba de la función. El objetivo es que un desarrollador
  nuevo entienda el propósito sin tener que leer el resto del archivo.

## La regla más importante del repo

**`firestore.rules` duplica intencionalmente varias validaciones que también
existen en `src/services/*`** (quién puede aprobar/rechazar usuarios, quién
puede cambiar `role`/`status`, la matriz de transición de status de una
reservación). Esto es deliberado: el cliente valida para dar buen UX
(mensajes de error específicos), pero las rules son la única barrera real
contra un cliente malicioso. **Si cambias una regla de negocio en
`src/services/`, revisa si `firestore.rules` necesita el mismo cambio, y
viceversa.** No asumas que basta con tocar un solo lado. `storage.rules`
sigue el mismo patrón para el logo del sitio: `isValidLogoFile()`
(`src/services/brandingRules.ts`) espeja el `allow write` de
`branding/logo` (tipo de archivo, tamaño máximo).

**`storage.rules` no puede usar `firestore.get()` en este proyecto —
lee el rol del custom claim del token (`request.auth.token.role`), no de
Firestore.** Se intentó primero con `firestore.get()` (Cross Service
Rules, la forma "obvia" de consultar el mismo doc `users/{uid}` que usa
`firestore.rules`) y compilaba bien, pero fallaba en **runtime** con
`permission denied` en todas las subidas, aunque el rol fuera correcto.
Causa: esa función requiere que Firestore y Storage estén en la **misma
ubicación**, y este proyecto los tiene distintos (Firestore `nam5`,
Storage `us-central1` — el bucket default que Firebase crea al activar
Storage no necesariamente queda alineado con la ubicación de Firestore
ya elegida). Diagnosticado probando en vivo contra producción, no
reproducible en el emulador (no hay Java en este entorno para
levantarlo). El fix real: `adminSetUserRole` (`functions/src/index.ts`)
setea un **custom claim** (`getAuth().setCustomUserClaims(uid, { role
})`) cada vez que cambia el rol de alguien — `setUserRole()` en
`src/services/users.ts` ya no escribe Firestore directo, pasa por esa
función. Los custom claims no llegan al cliente hasta el próximo
refresh del ID token (cerrar/abrir sesión, o `getIdToken(true)`) — si
agregas una capacidad nueva gateada por rol en `storage.rules`, usa
`request.auth.token.role`, no `firestore.get()`.

`allow delete` en `users/{uid}` es otro ejemplo con tres lugares en vez de
dos: rechazar un registro `pending` sigue siendo cosa de cualquier admin
(rama `resource.data.status == 'pending' && isAdmin()`), pero eliminar
cualquier otro usuario es exclusivo de super-admin — reforzado ahí mismo
(`|| isSuperAdmin()`) **y** en `adminDeleteColono`
(`functions/src/index.ts`, que además bloquea que un super-admin se
elimine a sí mismo, mismo check que `canActOnUser` en
`src/services/userRules.ts` usa del lado del cliente para bloquear
auto-cambio de rol y auto-eliminación).

**Crear una reservación es la excepción a ese patrón de dos lugares — son
tres.** El límite de reservaciones activas por usuario
(`maxActiveReservationsPerUser`) y la detección de traslapes de horario
(`hasOverlap`) requieren contar/leer todas las demás reservaciones de un
usuario o cancha — algo que `firestore.rules` no puede hacer (solo `get()`
de documentos puntuales, no queries agregadas). Por eso `allow create` en
`reservations` es simplemente `if false`: la única vía para crear una
reservación es la Cloud Function `createReservation`
(`functions/src/index.ts`), que corre con Admin SDK (bypasea rules) y hace
esas dos validaciones + el write dentro de una transacción de Firestore —
atómico, y sin el gap que existía antes (un cliente que escribiera directo
a Firestore podía saltarse ambas validaciones). Las reglas de negocio de
una reservación viven ahora en tres lugares que hay que mantener en sync:
`src/services/reservationRules.ts` (UX del cliente, feedback instantáneo),
`functions/src/reservationRules.ts` (autoridad real), y el resto de
`firestore.rules` para lo que NO es `create` (la matriz de transición de
status sigue reforzada ahí, ver abajo). Si cambias una regla de negocio de
reservaciones, revisa los tres.

**Máquina de estados de reservaciones:** `canTransition(actor, from, to)`
en `src/services/reservationRules.ts` es el espejo puro de la matriz de
transición en `firestore.rules` (bloque `match /reservations/{id}` →
`allow update`). Si cambias quién puede mover una reservación de un status
a otro, actualiza **ambos** — hay tests exhaustivos de `canTransition` en
`reservationRules.test.ts` que sirven de referencia de la matriz vigente.

**Expiración "lazy" (no una función programada):** el status guardado en Firestore
de una reservación puede estar desactualizado respecto al reloj real — nadie
lo corrige en el instante exacto en que expira. `effectiveStatus(reservation,
now)` en `reservationRules.ts` calcula el status real; `reservations.ts` la
usa en cada lectura (para disponibilidad/conteos) y además escribe el
status corregido de forma oportunista cuando lo detecta. `firestore.rules`
permite que **cualquier usuario autenticado** (no solo dueño/tesorero/admin)
haga esas dos transiciones específicas, pero solo si `request.time` ya pasó
`paymentDueAt`/`endAt` — es seguro porque el tiempo lo valida el servidor,
no el cliente. Si algún día se necesita precisión al segundo (vs. "la
próxima vez que alguien cargue esa vista"), migrar a una Cloud Function
programada es un cambio localizado que reutiliza `effectiveStatus()`.

## Emuladores, seeds y push-to-prod

**El flujo por default para desarrollar y probar es contra los emuladores,
no contra producción.** `npm run dev` sin más solo pega a producción si no
existe `.env.local` con `VITE_USE_EMULATORS=true` (ver `src/firebase.ts`).

```bash
cp .env.local.example .env.local   # una vez
npm run emulators                  # terminal 1 — Auth :9099, Firestore :8080, Functions :5001, Storage :9199, UI :4000
npm run seed                       # terminal 2 — prepobla courts/users/addresses/reservations
npm run dev                        # terminal 2
```

- **`npm run emulators`** (`firebase emulators:start`) requiere Java (JRE)
  para el emulador de Firestore — instálalo con `brew install openjdk` si
  `java -version` falla. El script `emulators` ya agrega al `PATH` las
  ubicaciones típicas de Homebrew (`/opt/homebrew/opt/openjdk/bin` en Apple
  Silicon, `/usr/local/opt/openjdk/bin` en Intel), porque `openjdk` es
  keg-only y por default no queda en el `PATH` de tu shell — así que no
  necesitas editar tu `.zshrc`/`.bash_profile` para que este comando
  funcione. Persiste datos entre corridas en `.emulator-data/` (gitignored)
  vía `--import`/`--export-on-exit`. El emulador de Hosting corre en el
  puerto `5050` (no `5000`) porque en macOS
  el `5000` suele estar tomado por AirPlay Receiver.
- **`npm run seed`** (`scripts/seed.mjs`) usa `firebase-admin` apuntado
  explícitamente a los puertos del emulador — nunca toca producción. Crea
  usuarios de Auth con `uid` fijo y su perfil correspondiente en Firestore
  (un usuario por rol — admin, colono activo x2, colono pendiente,
  tesorero), dos canchas, y tres reservaciones de ejemplo. Usuarios y
  canchas son **idempotentes** (`.set()` con id fijo: correrlo de nuevo
  actualiza los mismos documentos). Las reservaciones de ejemplo **no** —
  se crean con `.add()`, así que cada corrida agrega tres nuevas en vez de
  reemplazar las anteriores; si necesitas un estado limpio de
  reservaciones, borra la colección `reservations` a mano desde la
  Emulator UI antes de volver a sembrar.
  Si cambias `DEFAULT_COURT_SETTINGS` en `src/services/courts.ts`, actualiza
  también la copia duplicada en este script (comentario lo señala).
- **`npm run migrate-users-role`** (`scripts/migrate-users-role.mjs`)
  one-off contra producción: convierte el campo viejo `isAdmin: boolean` de
  usuarios existentes a `role: 'colono' | 'admin' | 'tesorero'` (`admin` si
  `isAdmin` era `true`, `colono` si no) y borra `isAdmin`. Ningún usuario
  existente queda como `tesorero` automáticamente — hay que asignarlo a
  mano desde el panel admin después de correr la migración. **Dry-run por
  default**; solo escribe con `--confirm`. Corre esto contra prod antes o
  justo al desplegar el PR de roles, para que ningún usuario real se quede
  sin el campo `role` que las rules ahora requieren.
- **`npm run push-to-prod`** (`scripts/push-to-prod.mjs`) migra colecciones
  seleccionadas del emulador local hacia producción — pensado para llevar
  configuración curada (p. ej. `courts`), no como sync general. Corre en
  **dry-run por default**; solo escribe con `--confirm` explícito. Usa
  `applicationDefault()` para las credenciales de producción (`gcloud auth
  application-default login`, o `GOOGLE_APPLICATION_CREDENTIALS` apuntando a
  un service account key — **nunca comitear esa key**). Sobreescribe
  (`set`, no `merge`) documentos existentes con el mismo id; no borra nada
  que exista en prod y no en local. Antes de correrlo con `--confirm` contra
  `users` o `reservations`, confirma con el usuario — son datos reales de
  personas.
- **`npm run preregister-colonos -- --file=colonos.json`**
  (`scripts/preregister-colonos.mjs`) alta en bloque de colonos existentes
  en producción a partir de un JSON (`{ "colonos": [...] }` — ver
  `scripts/preregister-colonos.example.json` para el shape exacto). Crea la
  cuenta de Auth + `users/{uid}` + `addresses/{key}`, mismo shape que
  `adminCreateColono` (`functions/src/index.ts`), con `status: 'active'` de
  inmediato. **Dry-run por default**; solo escribe con `--confirm`. Es
  seguro correrlo más de una vez sobre el mismo archivo (o uno ampliado) —
  un teléfono que ya tiene cuenta se omite silenciosamente, no es un error.
  Una fila con dato inválido (calle, teléfono, nombre, domicilio ya con 2
  colonos) se omite y se reporta al final; no aborta el resto del archivo.
  Antes de correrlo con `--confirm`, confirma con el usuario — son datos
  reales de personas.

App Check está activo incluso en dev cuando **no** usas emuladores
(`src/firebase.ts`) — los emuladores no pasan por App Check. Si desarrollas
contra producción, hay que tomar el debug token que la consola del navegador
imprime y registrarlo en **Firebase Console → App Check → Manage debug
tokens**, o las llamadas a Auth/Firestore fallan con `403`.

**Excepción:** el emulador de Functions sí aplica `enforceAppCheck: true` en
callables (`createReservation`, `adminCreateColono`, `getResidentsByAddress`)
— el Admin SDK verifica el token contra el backend real de App Check aunque
la función corra local, no hay bypass. Un debug token registrado (Console o
API de `firebaseappcheck.googleapis.com`) funciona igual ahí que en
producción: el cliente manda `X-Firebase-AppCheck` con el JWT que resulta de
canjear el debug token, y `onCall` lo acepta. Verificado 2026-08-29 contra el
emulador local con un debug token de prueba (creado y borrado vía API, no
quedó registrado).

**Para `npm run test:e2e` (Playwright) específicamente**: cada test arranca
un contexto de navegador nuevo, así que el debug token generado por default
(`FIREBASE_APPCHECK_DEBUG_TOKEN = true` en `src/firebase.ts`, uno nuevo por
sesión) nunca alcanza a registrarse a tiempo — cualquier callable con
`enforceAppCheck` (incluyendo `getResidentsByAddress`, que corre en el
primer paso de `LoginPage`) falla con `Unauthenticated` y Playwright ve el
toast de error genérico, no un timeout obvio de App Check. Fija
`VITE_APPCHECK_DEBUG_TOKEN` en `.env.local` a un UUID propio y regístralo
una vez (Console o API) — ver `.env.local.example`. Sin esto, `npm run
test:e2e` falla en el primer paso que llame a cualquier función protegida.

## Al agregar features

- Si tocas el modelo de reservaciones/canchas, actualiza `src/types/index.ts`
  primero, luego los servicios, luego la UI — y revisa si hace falta un
  nuevo índice compuesto en `firestore.indexes.json` (Firestore falla en
  runtime con un link para crearlo si falta uno; no lo adivines a mano salvo
  que puedas verificar el patrón de query). Si un cambio de query deja un
  índice sin uso, quítalo del archivo — pero `firebase deploy --only
  firestore:indexes` **no borra** el índice ya creado en producción, solo
  deja de declararlo; si quieres liberar el espacio/costo real hay que
  borrarlo a mano desde la consola de Firebase.
- Nuevas reglas de negocio en reservaciones casi siempre necesitan tocar
  tanto `src/services/reservations.ts` como `firestore.rules` (ver sección
  anterior) — y si la regla aplica a la creación de una reservación
  (`createReservation`), también `functions/src/index.ts` y
  `functions/src/reservationRules.ts`.
