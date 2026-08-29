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
```

No hay lint script ni test runner configurados en `package.json`. El único
gate de calidad automatizado es el type-check que corre `tsc -b` como parte
de `npm run build` (strict mode, `noUnusedLocals`, `noUnusedParameters`
activos en `tsconfig.app.json`) — corre `npm run build` antes de dar por
terminado un cambio no trivial.

No hay Firebase CLI instalado por defecto en este entorno
(`npm install -g firebase-tools` si necesitas emuladores o deploy). No hay
`.firebaserc` en el repo — hace falta `firebase use --add` para enlazar el
proyecto `padel-toscana` antes de desplegar.

## Flujo de trabajo

- **Toda tarea nueva va en su propio branch** — nunca commits directos a
  `main`. Al terminar y verificar el cambio (`npm run build` limpio, feature
  probada), se abre un **Pull Request** para revisión, en vez de mergear
  directo.

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

## Firebase local / debugging

- App Check está activo incluso en dev (`src/firebase.ts`). Para que
  Auth/Firestore funcionen en local sin bloquear por 403, hay que tomar el
  debug token que la consola del navegador imprime y registrarlo en
  **Firebase Console → App Check → Manage debug tokens**.
- No hay emuladores de Firebase configurados en `firebase.json` — el dev
  server pega directo al proyecto real `padel-toscana`. Ten cuidado con
  datos de prueba: reservaciones/usuarios creados en dev quedan en el
  proyecto de producción salvo que configures emuladores.

## Al agregar features

- Si tocas el modelo de reservaciones/canchas, actualiza `src/types/index.ts`
  primero, luego los servicios, luego la UI — y revisa si hace falta un
  nuevo índice compuesto en `firestore.indexes.json` (Firestore falla en
  runtime con un link para crearlo si falta uno; no lo adivines a mano salvo
  que puedas verificar el patrón de query).
- Nuevas reglas de negocio en reservaciones casi siempre necesitan tocar
  tanto `src/services/reservations.ts` como `firestore.rules` (ver sección
  anterior).
