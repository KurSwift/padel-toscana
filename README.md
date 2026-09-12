# Padel Toscana

[![CI](https://github.com/KurSwift/padel-toscana/actions/workflows/ci.yml/badge.svg)](https://github.com/KurSwift/padel-toscana/actions/workflows/ci.yml)

App privada de reservación de canchas de pádel y casa club para los
residentes del fraccionamiento Toscana (calles Nogal, Olivo y Encino).
El alta de colonos la hace un administrador — no hay auto-registro.

Para el detalle del dominio (roles, flujo de alta y login, modelo de
datos, reglas de negocio) ver [CONTEXT.md](./CONTEXT.md). Para convenciones
de código y comandos, ver [AGENTS.md](./AGENTS.md).

## Stack

React 19 · TypeScript · Vite 6 · Tailwind CSS 3 · React Router 7 · Firebase
(Auth, Firestore, Storage, Cloud Functions v2, App Check, Analytics).

## Requisitos

- Node.js 22 (misma versión que `functions/package.json` → `engines.node`
  y el runtime real de Cloud Functions — usa esa si vas a tocar
  `functions/`)
- **Java (JRE 11+)** — lo requiere el emulador de Firestore. Instálalo con
  `brew install openjdk` si no lo tienes (`java -version` para verificar).
- Solo si vas a desarrollar contra producción en vez de emuladores: una
  cuenta con acceso al proyecto Firebase `padel-toscana`.

## Empezar (recomendado: contra emuladores, no producción)

```bash
npm install
cp .env.local.example .env.local   # activa VITE_USE_EMULATORS=true
npm run emulators                  # terminal 1 — deja corriendo
npm run seed                       # terminal 2 — una sola vez, prepobla datos
npm run dev                        # terminal 2 — sirve la app
```

Abre `http://localhost:5173`. La UI de los emuladores (para inspeccionar/
editar datos a mano) queda en `http://localhost:4000`. El seed imprime los
teléfonos de prueba (admin y residentes) para iniciar sesión — ver
[AGENTS.md](./AGENTS.md#emuladores-seeds-y-push-to-prod).

Los datos del emulador persisten entre corridas en `.emulator-data/`
(ignorado por git, vía `--export-on-exit`/`--import` en el script
`emulators`).

### Alternativa: desarrollar contra producción

No recomendado para trabajo día a día (lees/escribes datos reales), pero a
veces es necesario para depurar algo específico:

```bash
npm run dev   # sin .env.local, o con VITE_USE_EMULATORS=false
```

App Check está activo incluso en local. La primera vez que abras la app en
el navegador, la consola imprimirá un debug token — cópialo y regístralo en
**Firebase Console → App Check → Manage debug tokens**. Sin esto, las
llamadas a Auth/Firestore fallarán con `403`. (Los emuladores no pasan por
App Check, así que este paso solo aplica al modo producción.)

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite) |
| `npm run build` | Type-check (`tsc -b`) + build de producción → `public/` |
| `npm run preview` | Sirve el build de producción localmente |
| `npm run emulators` | Levanta Auth + Firestore + Functions + Storage emulators (con persistencia en `.emulator-data/`) |
| `npm run seed` | Prepobla el emulador con canchas, casa club, usuarios y reservaciones de ejemplo |
| `npm run seed:casa-club` | Agrega reservaciones de ejemplo de casa club en varios estados (requiere `npm run seed` antes) |
| `npm run clear-emulator-data` | Borra todas las colecciones del emulador |
| `npm run push-to-prod` | Migra colecciones seleccionadas del emulador a producción (dry-run por default) |
| `npm run migrate-users-role` | One-off: migra `isAdmin` (bool) a `role` en usuarios existentes de producción (dry-run por default) |
| `npm run preregister-colonos -- --file=x.json` | Alta en bloque de colonos en producción desde un JSON (dry-run por default) |
| `npm run test` | Vitest — lógica de negocio pura del cliente, una corrida |
| `npm run test:watch` | Vitest en modo watch |
| `npm run test:e2e` | Playwright — flujos críticos E2E contra los emuladores (ver `e2e/`) |
| `npm run functions:build` | Type-check de `functions/` (build separado, ver sección Firebase) |
| `npm run test:functions` | Vitest de `functions/` |
| `npm run functions:deploy` | Deploy solo de Cloud Functions (requiere plan Blaze) |

No hay lint configurado. Los gates automatizados de calidad son
`npm run build` + `npm run test` para `src/`, y `npm run functions:build`
+ `npm run test:functions` para `functions/` — ver AGENTS.md para el
detalle completo de cada script (incluye los de un solo uso como
`push-to-prod`/`migrate-users-role`/`preregister-colonos`, que escriben
en producción real con `--confirm`).

## Firebase

- Proyecto: `padel-toscana` (Firestore + Hosting + Auth con Google Sign-In
  + Storage + App Check + Cloud Functions v2), enlazado vía `.firebaserc`.
  Plan Blaze (de pago) — lo requiere `functions/`.
- `functions/` es un proyecto TypeScript aparte (su propio
  `package.json`/`tsconfig.json`, no forma parte de `tsc -b` de la raíz) —
  siete Cloud Functions para las operaciones que necesitan Admin SDK
  (crear reservaciones, alta/baja de colonos, asignar roles, lecturas
  pre-auth y alta masiva). Ver AGENTS.md para el detalle de cada una.
- Deploy de hosting + reglas de Firestore:
  ```bash
  npm run build
  firebase deploy
  ```
  Para desplegar solo Cloud Functions: `npm run functions:deploy`.
- Las reglas de seguridad (`firestore.rules`) duplican intencionalmente
  varias validaciones que también existen en `src/services/*` — ver
  AGENTS.md antes de cambiar reglas de negocio en cualquiera de los dos
  lados.
- **Nunca ejecutes `npm run push-to-prod --confirm` sin revisar antes el
  dry-run** (el comando sin `--confirm`) — escribe directo en producción y
  sobreescribe documentos existentes con el mismo id. Lo mismo aplica a
  `migrate-users-role`/`preregister-colonos` con `--confirm`.

### Privacidad y Analytics

- Firebase Analytics se inicializa solo fuera de emuladores y solo en
  navegadores compatibles. Los eventos de prueba locales no contaminan las
  métricas de producción.
- El aviso público en `/privacidad` explica la analítica automática. Muestra
  que las métricas son agregadas de navegación e interacción y que no se
  envían nombres, teléfonos, domicilios, correos, UID, ni contenido o
  identificadores de reservaciones.
- La base para eventos personalizados vive en `src/services/analytics.ts` y
  `analyticsRules.ts`: solo admite un catálogo de eventos y parámetros
  categóricos. La instrumentación de flujos de login y reservación sigue
  pendiente (issues [#111](https://github.com/KurSwift/padel-toscana/issues/111)
  y [#112](https://github.com/KurSwift/padel-toscana/issues/112)).

## Estructura

```
src/
  firebase.ts        # init de Firebase (auth, db, functions, app check, analytics, emuladores)
  App.tsx            # rutas (incluye /calendario y /privacidad, públicas)
  context/           # AuthContext (usuario + perfil), ThemeContext, SiteSettingsContext
  components/        # UI reutilizable
  pages/             # LoginPage, RegisterPage, HomePage, AdminPage, TesoreroPage, HelpPage,
                      # PublicCalendarPage y PrivacyPage (públicas)
  services/          # única capa que habla con Firestore/Auth/Storage/Functions
  hooks/             # useCourtData
  types/             # tipos de los documentos de Firestore
  utils/             # helpers de fecha/hora
scripts/
  seed.mjs                  # prepobla el emulador con datos de ejemplo (canchas, casa club, usuarios)
  seed-casa-club.mjs        # agrega reservaciones de ejemplo de casa club (requiere seed.mjs antes)
  clear-emulator-data.mjs   # borra todas las colecciones del emulador
  push-to-prod.mjs          # migra colecciones seleccionadas del emulador a producción
  migrate-users-role.mjs    # one-off, ver tabla de Scripts
  preregister-colonos.mjs   # alta en bloque de colonos en producción desde un JSON
functions/           # Cloud Functions v2 + TypeScript — build/deploy propios, ver sección Firebase
e2e/                 # Playwright — flujos críticos contra los emuladores, ver AGENTS.md
```
