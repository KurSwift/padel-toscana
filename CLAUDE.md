# CLAUDE.md

Este repo tiene dos documentos que ya cubren lo esencial — léelos antes de
tocar código:

- **[AGENTS.md](./AGENTS.md)** — comandos, estructura, convenciones de código,
  y la regla más importante del repo (reglas de negocio duplicadas en
  cliente + `firestore.rules`, deben mantenerse en sync).
- **[CONTEXT.md](./CONTEXT.md)** — el dominio: qué es Padel Toscana, roles,
  flujo de registro/aprobación, flujo de reservación, modelo de datos, y los
  gaps conocidos (sin Cloud Functions, la extensión de correo no está
  declarada en `firebase.json`).

## Notas específicas para trabajar en este repo con Claude Code

- **No hay lint script.** Los gates son `npm run build` (type-check con
  `tsc -b` en modo estricto + build de Vite) y `npm run test` (Vitest, para
  la lógica de negocio pura en `src/services/reservationRules.ts` y
  `src/utils/time.ts`). Córrelos antes de dar por terminado un cambio en
  `src/`. Si agregas una validación de negocio nueva, prefiere escribirla
  como función pura testeable (ver AGENTS.md) y agrega sus tests ahí mismo.
- **Prueba y desarrolla contra los emuladores, no producción.** `cp
  .env.local.example .env.local`, `npm run emulators` + `npm run seed` (ver
  AGENTS.md, sección "Emuladores, seeds y push-to-prod"). El emulador de
  Firestore requiere Java; si no está disponible en el entorno, avisa al
  usuario en vez de asumir que puedes levantarlo.
- Si trabajas explícitamente contra producción (sin `.env.local` o con
  `VITE_USE_EMULATORS=false`), **App Check bloquea llamadas reales** hasta
  registrar un debug token en Firebase Console. Espera un `403` en
  Auth/Firestore a menos que ese token ya esté registrado — no es una
  regresión tuya.
- **`scripts/push-to-prod.mjs` escribe en producción real.** Nunca lo
  corras con `--confirm` sin que el usuario lo haya pedido explícitamente
  para esa corrida — ni siquiera si ya usó el flag antes. El dry-run (sin
  `--confirm`) es seguro de correr para inspeccionar.
- Cuando cambies validaciones de negocio (límites de reservación, traslapes,
  aprobación de usuarios, roles), toca **tanto** el servicio en
  `src/services/*` **como** `firestore.rules` — ver AGENTS.md para el porqué.
- El proyecto es 100% español en textos de usuario (labels, toasts, errores).
  Mantén ese idioma en cualquier UI nueva.
