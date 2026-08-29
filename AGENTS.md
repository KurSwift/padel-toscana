# AGENTS.md

Guía técnica para agentes de código (y humanos) trabajando en este repo. Para
el contexto de negocio/dominio ver [CONTEXT.md](./CONTEXT.md).

## Stack

React 19 + TypeScript + Vite 6, Tailwind CSS 3, React Router 7, Firebase v11
(Auth, Firestore, App Check) vía SDK modular. Sin backend propio: no hay
Cloud Functions ni servidor — toda la lógica de negocio vive en
`src/services/*` y se refuerza en `firestore.rules`.

## Comandos

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo (Vite, http://localhost:5173)
npm run build       # tsc -b (type-check) + vite build → sale a public/
npm run preview     # sirve el build de producción localmente
npm run emulators   # Auth + Firestore emulators (requiere Java)
npm run seed        # prepobla el emulador con datos de ejemplo
npm run push-to-prod  # migra colecciones seleccionadas emulador → producción (dry-run por default)
npm run test        # corre la suite de Vitest una vez (CI-friendly)
npm run test:watch  # Vitest en modo watch, para desarrollo
```

No hay lint script configurado en `package.json`. Los gates de calidad
automatizados son: el type-check que corre `tsc -b` como parte de
`npm run build` (strict mode, `noUnusedLocals`, `noUnusedParameters` activos
en `tsconfig.app.json`), y `npm run test` (Vitest) para la lógica de negocio
pura. Corre ambos antes de dar por terminado un cambio no trivial.

`firebase-tools` y `firebase-admin` están como devDependencies (no hace
falta instalar nada global). El proyecto está enlazado vía `.firebaserc`
(`padel-toscana`) — si necesitas otro proyecto, `firebase use --add`.

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
  firebase.ts          # init de app/auth/db/app-check — config está hardcodeada aquí
  App.tsx              # rutas (react-router)
  context/AuthContext   # user de Firebase Auth + su UserProfile (Firestore), vía onSnapshot
  components/           # UI reutilizable (BookingSheet, SlotsGrid, DateSelector, ProtectedRoute...)
  pages/                 # HomePage, AdminPage, LoginPage, RegisterPage
  services/              # única capa que toca Firestore/Auth directamente (auth, courts, reservations, users)
  hooks/useCourtData     # combina cancha activa + reservaciones del día + reservaciones del usuario
  types/index.ts         # shapes de Firestore (UserProfile, Court, Reservation...) — fuente de verdad de tipos
  utils/time.ts          # helpers de fecha/hora en formato 'HH:mm' / 'YYYY-MM-DD' (strings, no Date en el modelo)
  services/reservationRules.ts  # lógica pura de reservaciones (sin imports de firebase/*), testeada con Vitest
  services/userRules.ts   # lógica pura de roles/permisos (mismo patrón), testeada con Vitest
scripts/
  seed.mjs               # prepobla el emulador (firebase-admin, nunca toca producción)
  push-to-prod.mjs        # migra colecciones seleccionadas emulador → producción
  migrate-users-role.mjs  # one-off: isAdmin (bool) → role (string) en usuarios existentes de prod
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
existen en `src/services/*`** (límite de reservaciones activas, traslapes de
horario, quién puede aprobar/rechazar usuarios, quién puede cambiar
`isAdmin`/`status`). Esto es deliberado: el cliente valida para dar buen UX
(mensajes de error específicos), pero las rules son la única barrera real
contra un cliente malicioso. **Si cambias una regla de negocio en
`src/services/`, revisa si `firestore.rules` necesita el mismo cambio, y
viceversa.** No asumas que basta con tocar un solo lado.

## Emuladores, seeds y push-to-prod

**El flujo por default para desarrollar y probar es contra los emuladores,
no contra producción.** `npm run dev` sin más solo pega a producción si no
existe `.env.local` con `VITE_USE_EMULATORS=true` (ver `src/firebase.ts`).

```bash
cp .env.local.example .env.local   # una vez
npm run emulators                  # terminal 1 — Auth :9099, Firestore :8080, UI :4000
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
  tesorero), dos canchas, y una reservación de ejemplo. Es **idempotente**:
  correrlo de nuevo actualiza los mismos documentos en vez de duplicarlos.
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

App Check está activo incluso en dev cuando **no** usas emuladores
(`src/firebase.ts`) — los emuladores no pasan por App Check. Si desarrollas
contra producción, hay que tomar el debug token que la consola del navegador
imprime y registrarlo en **Firebase Console → App Check → Manage debug
tokens**, o las llamadas a Auth/Firestore fallan con `403`.

## Al agregar features

- Si tocas el modelo de reservaciones/canchas, actualiza `src/types/index.ts`
  primero, luego los servicios, luego la UI — y revisa si hace falta un
  nuevo índice compuesto en `firestore.indexes.json` (Firestore falla en
  runtime con un link para crearlo si falta uno; no lo adivines a mano salvo
  que puedas verificar el patrón de query).
- Nuevas reglas de negocio en reservaciones casi siempre necesitan tocar
  tanto `src/services/reservations.ts` como `firestore.rules` (ver sección
  anterior).
