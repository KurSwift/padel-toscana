# CLAUDE.md

Este repo tiene dos documentos que ya cubren lo esencial — léelos antes de
tocar código:

- **[AGENTS.md](./AGENTS.md)** — comandos, estructura, convenciones de código,
  y la regla más importante del repo (reglas de negocio duplicadas en
  cliente + `firestore.rules`, deben mantenerse en sync).
- **[CONTEXT.md](./CONTEXT.md)** — el dominio: qué es Padel Toscana, roles,
  flujo de alta de colonos y login (por admin, no auto-registro — ver
  "Flujo de alta y login" en CONTEXT.md), flujo de reservación, modelo de
  datos, y los gaps conocidos (la extensión de correo no está declarada en
  `firebase.json`).

## Notas específicas para trabajar en este repo con Claude Code

- **No hay lint script.** Los gates son `npm run build` (type-check con
  `tsc -b` en modo estricto + build de Vite) y `npm run test` (Vitest, para
  la lógica de negocio pura en `src/services/*Rules.ts` y `src/utils/time.ts`).
  Córrelos antes de dar por terminado un cambio en `src/`. Si el cambio
  toca `functions/` (build/tests separados, propio `package.json`), corre
  también `npm run functions:build` y `npm run test:functions` — ver
  AGENTS.md.
- **Toda lógica de negocio nueva o modificada lleva tests de Vitest — no es
  opcional.** Si la validación vive dentro de una función async que hace
  `await` a Firestore, extrae la parte pura (decisión/validación) a una
  función testeable por separado (ver AGENTS.md) y testea esa función. No
  des una tarea por terminada con lógica de negocio sin cobertura.
- **Prueba y desarrolla contra los emuladores, no producción.** `cp
  .env.local.example .env.local`, `npm run emulators` + `npm run seed` (ver
  AGENTS.md, sección "Emuladores, seeds y push-to-prod"). El emulador de
  Firestore requiere Java; si no está disponible en el entorno, avisa al
  usuario en vez de asumir que puedes levantarlo.
- **Toda descripción de PR incluye pasos de verificación manual** (qué
  usuario/rol de `npm run seed` usar, qué probar, qué se espera ver) —
  no solo el test plan automatizado. Si no pudiste correr los emuladores
  tú mismo (p. ej. sin Java en el entorno), escribe esos pasos igual para
  que el usuario los siga, y dilo explícitamente en vez de dar la
  verificación por hecha.
- Si trabajas explícitamente contra producción (sin `.env.local` o con
  `VITE_USE_EMULATORS=false`), **App Check bloquea llamadas reales** hasta
  registrar un debug token en Firebase Console. Espera un `403` en
  Auth/Firestore a menos que ese token ya esté registrado — no es una
  regresión tuya.
- **Cualquier script en `scripts/` que acepte `--confirm` escribe en
  producción real** (`push-to-prod.mjs`, `migrate-users-role.mjs`,
  `preregister-colonos.mjs`, y cualquiera que se agregue después con ese
  mismo patrón). Nunca corras uno con `--confirm` sin que el usuario lo
  haya pedido explícitamente para esa corrida — ni siquiera si ya usó el
  flag antes. El dry-run (sin `--confirm`) es seguro de correr para
  inspeccionar.
- Cuando cambies validaciones de negocio (límites de reservación, traslapes,
  aprobación de usuarios, roles), toca **tanto** el servicio en
  `src/services/*` **como** `firestore.rules` — ver AGENTS.md para el porqué.
- El proyecto es 100% español en textos de usuario (labels, toasts, errores).
  Mantén ese idioma en cualquier UI nueva.
