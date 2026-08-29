# Padel Toscana

App privada de reservación de canchas de pádel para los residentes del
fraccionamiento Toscana (calles Nogal, Olivos y Encino). Los registros
requieren aprobación de un administrador antes de poder reservar.

Para el detalle del dominio (roles, flujo de registro/aprobación, modelo de
datos, reglas de negocio) ver [CONTEXT.md](./CONTEXT.md). Para convenciones
de código y comandos, ver [AGENTS.md](./AGENTS.md).

## Stack

React 19 · TypeScript · Vite 6 · Tailwind CSS 3 · React Router 7 · Firebase
(Auth, Firestore, App Check).

## Requisitos

- Node.js 20+
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
| `npm run emulators` | Levanta Auth + Firestore emulators (con persistencia en `.emulator-data/`) |
| `npm run seed` | Prepobla el emulador con canchas, usuarios y una reservación de ejemplo |
| `npm run push-to-prod` | Migra colecciones seleccionadas del emulador a producción (dry-run por default) |

No hay lint ni test runner configurados; `npm run build` es el único gate
automatizado de calidad.

## Firebase

- Proyecto: `padel-toscana` (Firestore + Hosting + Auth con Google Sign-In),
  enlazado vía `.firebaserc`.
- Deploy de hosting + reglas de Firestore:
  ```bash
  npm run build
  firebase deploy
  ```
- Las reglas de seguridad (`firestore.rules`) duplican intencionalmente
  varias validaciones que también existen en `src/services/*` — ver
  AGENTS.md antes de cambiar reglas de negocio en cualquiera de los dos
  lados.
- **Nunca ejecutes `npm run push-to-prod --confirm` sin revisar antes el
  dry-run** (el comando sin `--confirm`) — escribe directo en producción y
  sobreescribe documentos existentes con el mismo id.

## Estructura

```
src/
  firebase.ts        # init de Firebase (auth, db, app check, conexión a emuladores)
  App.tsx            # rutas
  context/           # AuthContext (usuario + perfil)
  components/        # UI reutilizable
  pages/             # LoginPage, RegisterPage, HomePage, AdminPage
  services/          # única capa que habla con Firestore/Auth
  hooks/             # useCourtData
  types/             # tipos de los documentos de Firestore
  utils/             # helpers de fecha/hora
scripts/
  seed.mjs           # prepobla el emulador con datos de ejemplo
  push-to-prod.mjs   # migra colecciones seleccionadas del emulador a producción
```
