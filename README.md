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
- Una cuenta con acceso al proyecto Firebase `padel-toscana` (para que
  Auth/Firestore funcionen contra datos reales; no hay emuladores
  configurados).

## Empezar

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

**Importante:** App Check está activo incluso en local. La primera vez que
abras la app en el navegador, la consola imprimirá un debug token — cópialo
y regístralo en **Firebase Console → App Check → Manage debug tokens**. Sin
esto, las llamadas a Auth/Firestore fallarán con `403`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite) |
| `npm run build` | Type-check (`tsc -b`) + build de producción → `public/` |
| `npm run preview` | Sirve el build de producción localmente |

No hay lint ni test runner configurados; `npm run build` es el único gate
automatizado de calidad.

## Firebase

- Proyecto: `padel-toscana` (Firestore + Hosting + Auth con Google Sign-In).
- No hay `.firebaserc` en el repo — antes de desplegar, enlaza el proyecto:
  ```bash
  npm install -g firebase-tools   # si no lo tienes
  firebase login
  firebase use --add              # selecciona padel-toscana
  ```
- Deploy de hosting + reglas de Firestore:
  ```bash
  npm run build
  firebase deploy
  ```
- Las reglas de seguridad (`firestore.rules`) duplican intencionalmente
  varias validaciones que también existen en `src/services/*` — ver
  AGENTS.md antes de cambiar reglas de negocio en cualquiera de los dos
  lados.

## Estructura

```
src/
  firebase.ts        # init de Firebase (auth, db, app check)
  App.tsx            # rutas
  context/           # AuthContext (usuario + perfil)
  components/        # UI reutilizable
  pages/             # LoginPage, RegisterPage, HomePage, AdminPage
  services/          # única capa que habla con Firestore/Auth
  hooks/             # useCourtData
  types/             # tipos de los documentos de Firestore
  utils/             # helpers de fecha/hora
```
