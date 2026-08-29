# CLAUDE.md

Este repo tiene dos documentos que ya cubren lo esencial — léelos antes de
tocar código:

- **[AGENTS.md](./AGENTS.md)** — comandos, estructura, convenciones de código,
  y la regla más importante del repo (reglas de negocio duplicadas en
  cliente + `firestore.rules`, deben mantenerse en sync).
- **[CONTEXT.md](./CONTEXT.md)** — el dominio: qué es Padel Toscana, roles,
  flujo de registro/aprobación, flujo de reservación, modelo de datos, y los
  gaps conocidos (sin `.firebaserc`, sin Cloud Functions, sin tests, la
  extensión de correo no está declarada en `firebase.json`).

## Notas específicas para trabajar en este repo con Claude Code

- **No hay test suite ni lint script.** El único gate es `npm run build`
  (type-check con `tsc -b` en modo estricto + build de Vite). Córrelo antes
  de dar por terminado un cambio en `src/`.
- **App Check bloquea llamadas reales a Firebase en local** hasta registrar
  un debug token en Firebase Console (ver AGENTS.md, sección "Firebase local
  / debugging"). Si vas a verificar una feature en el navegador (con el
  skill `run` o Playwright), espera un `403` en Auth/Firestore a menos que
  ese token ya esté registrado — no es una regresión tuya.
- **No hay emuladores configurados** — el dev server (`npm run dev`) pega al
  proyecto Firebase real (`padel-toscana`). Ten cuidado al probar flujos que
  escriben datos (registro, reservaciones): quedan en producción.
- Cuando cambies validaciones de negocio (límites de reservación, traslapes,
  aprobación de usuarios, roles), toca **tanto** el servicio en
  `src/services/*` **como** `firestore.rules` — ver AGENTS.md para el porqué.
- El proyecto es 100% español en textos de usuario (labels, toasts, errores).
  Mantén ese idioma en cualquier UI nueva.
