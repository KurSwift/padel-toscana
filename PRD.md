# Reservaciones - La Toscana — PRD

- **Nombre del producto:** Reservaciones - La Toscana (Canchas de Padel)
- **Plataforma:** Web app, responsive (mobile-first)
- **Stack técnico:** React 19 + TypeScript + Vite 6, Tailwind CSS 3, React Router 7 — Firebase v11 (Auth, Firestore, Cloud Storage, Cloud Functions v2, Hosting, App Check)
- **Desarrollador:** Ernesto Sanchez Kuri

## Compromiso SLC

**Simple, Loveable, Complete — no un MVP.** Cada feature que se
despliega debe sentirse completa, pulida y placentera de usar — no
solo funcional. Una feature desplegada con huecos conocidos,
workarounds documentados, o casos borde deliberadamente omitidos no
cumple el estándar, aunque el camino principal funcione. "Después
cerramos el hueco" no es una razón aceptable para desplegar.

Este estándar aplica por feature al momento del deploy, no por hito del
proyecto — cada pieza de trabajo debe sentirse terminada por sí sola,
no como un paso hacia un futuro estado terminado.

## 1. Resumen

Reservaciones - La Toscana es una web app privada, por invitación, para
que los residentes de un fraccionamiento con canchas de padel reserven,
paguen y gestionen sus reservaciones — reemplazando la coordinación
informal con un sistema que aplica automáticamente las reglas propias
de la comunidad (límites de reservación, anticipación mínima, plazos
de pago). Los colonos reservan y cancelan sus propias reservaciones;
un tesorero confirma los pagos hechos fuera de la app; un admin
gestiona las canchas y valida a los residentes nuevos; un super-admin
además controla la marca del sitio y la asignación de roles.

## 2. Problema

Antes de esta app no existía ningún sistema formal de reservación. Las
canchas las coordinaba un encargado externo, y el aviso de disponibilidad
dependía de que él notificara a tiempo cuando una cancha ya estaba
reservada — algo que fallaba con frecuencia. Sin una fuente de verdad
confiable y en tiempo real, la coordinación se degradó: los colonos
terminaban simplemente ocupando la cancha que encontraban libre, o
avisando su intención en un grupo de WhatsApp — un canal donde el
mensaje se perdía fácilmente entre el resto de la conversación.

El resultado: no había ningún control real sobre quién usaba la cancha
y cuándo. Alguien podía creer que tenía una reservación válida y
encontrarse con que otro colono ya la estaba usando, sin ningún
registro confiable de quién reservó primero ni de si se había pagado.

## 3. Motivación

La mesa directiva entrante identificó este problema como una prioridad
al asumir su gestión, y decidió resolverlo con un sistema nuevo y más
ordenado — reemplazando la coordinación informal por reglas aplicadas
automáticamente, en vez de depender de que una persona avise a tiempo.

## 4. Usuarios objetivo

- **Colono** — residente de alguna de las ~105 casas de la comunidad
  (calles Nogal, Olivo, Encino; número por confirmar). El usuario más
  numeroso y frecuente. Quiere reservar una cancha sin conflicto, ver
  el estado de sus propias reservaciones (pendiente de pago / confirmada)
  y saber cuánto y cuándo pagar, sin tener que coordinar nada
  manualmente con nadie.
- **Tesorero** — miembro de la mesa directiva encargado de confirmar los
  pagos que los colonos hacen fuera de la app (efectivo, transferencia).
  Necesita ver rápido quién tiene pagos pendientes y marcarlos como
  confirmados sin fricción.
- **Admin** — miembro de la mesa directiva que gestiona las canchas
  (horarios, límites, tarifas), valida y da de alta a los residentes
  nuevos, y puede intervenir sobre cualquier reservación si hace falta.
- **Super-admin** — miembro(s) de la mesa directiva con el acceso más
  amplio: todo lo que puede hacer un admin, más asignar roles a otros
  colonos y controlar la identidad del sitio (nombre, logo, color de
  acento, contacto).

## 5. Funcionalidades / Alcance

### Alta y acceso
- Alta de colonos exclusivamente por admin/super-admin (sin
  auto-registro activo) — nombre, calle, número, teléfono.
- Login por domicilio (calle + número) → saludo por nombre → OTP por
  teléfono. Sin contraseñas.
- Aprobación/rechazo de solicitudes (flujo de auto-registro legado,
  sin punto de entrada activo hoy).

### Reservación de canchas
- Ver horarios disponibles por cancha y día, con reglas de la
  comunidad aplicadas automáticamente: máximo de reservaciones activas
  por colono, anticipación mínima y máxima, duración máxima por
  reservación, tope de jugadores.
- Reservar indicando duración, número de jugadores, y residente a
  cargo.
- Ver el estado de las propias reservaciones (pendiente de pago,
  confirmada, cancelada, finalizada).
- Cancelar una reservación propia.
- Liberación automática de una reservación no pagada a tiempo (sin
  intervención manual).

### Pagos
- El pago se hace fuera de la app (efectivo/transferencia al
  tesorero).
- El tesorero confirma el pago desde su propia vista, marcando la
  reservación como pagada.

### Panel de administración
- Ver y cambiar el estado de cualquier reservación del día.
- Activar/desactivar canchas y editar sus reglas (horario, duración,
  límites, anticipación, plazo de pago, tarifa).
- Aprobar/rechazar solicitudes pendientes, dar de alta colonos nuevos.

### Panel avanzado (super-admin)
- Asignar el rol de cualquier colono (colono/admin/tesorero/super-admin).
- Eliminar cuentas de usuario por completo (cuenta + perfil + cupo del
  domicilio liberado).
- Subir el logo del sitio.
- Elegir el color de acento de la app entre paletas predefinidas.
- Editar el nombre del sitio y un link de contacto de WhatsApp.

### Ayuda
- Guía de uso y preguntas frecuentes, con contenido distinto según el
  rol de quien la ve.

## 6. Roles y permisos

Cuatro roles, cada uno superset del anterior salvo donde se indica una
restricción exclusiva:

- **Colono** — solo puede reservar y cancelar sus propias
  reservaciones. No ve ni puede tocar las de nadie más.
- **Tesorero** — superset de colono, más: puede confirmar el pago de
  cualquier reservación pendiente. No puede cancelar reservaciones
  ajenas más allá de eso, ni tocar canchas o usuarios.
- **Admin** — superset de tesorero. Gestiona canchas, ve y cambia el
  estado de cualquier reservación, aprueba/rechaza solicitudes, da de
  alta colonos nuevos. **No** puede asignar roles ni eliminar cuentas —
  decisión deliberada: dar de alta gente es reversible y de bajo
  riesgo, pero cambiar permisos o borrar cuentas es lo bastante
  sensible como para reservarse a super-admin.
- **Super-admin** — superset de admin. Además: asigna el rol de
  cualquier usuario, elimina cuentas por completo, y controla la
  identidad del sitio (logo, color de acento, nombre, contacto).

Reglas transversales:
- Nadie puede actuar sobre su propia cuenta en acciones sensibles
  (cambiar su propio rol, eliminarse a sí mismo) — ni siquiera un
  super-admin. Evita una autodegradación por error, o que el sitio se
  quede sin ningún super-admin.
- El primer super-admin no tiene un flujo de auto-promoción — se
  asigna a mano directo en la base de datos como parte del arranque
  del sistema.

## 7. Fuera de alcance

- **Pagos dentro de la app.** El pago se hace fuera del sistema
  (efectivo, transferencia); la app solo registra que el tesorero lo
  confirmó. No hay integración con pasarelas de pago.
- **Soporte multi-fraccionamiento.** El sistema está construido para
  esta comunidad específica, no como producto genérico para múltiples
  HOAs/fraccionamientos con configuración por cliente.
- **Múltiples deportes o instalaciones (por ahora).** Solo canchas de
  padel hoy. Hay una solicitud real de habilitar la reservación de la
  casa club en este mismo portal — no descartada, pendiente de diseño
  (ver Pregunta abierta en la sección 14).
- **App nativa (iOS/Android).** Solo web responsive; no hay planes de
  apps nativas.
- **Soporte offline.** La app requiere conexión a internet — no hay
  service worker ni funcionalidad sin conexión, pese a ser instalable
  como acceso directo.
- **Mensajería o chat interno.** La comunicación entre colonos sigue
  pasando por el grupo de WhatsApp existente, fuera de la app.
- **Auto-registro como punto de entrada.** El código de auto-registro
  sigue existiendo mas no se usa — el acceso es siempre por alta
  manual de un admin/super-admin.

## 8. Métricas de éxito

- **Cero disputas por doble-reservación o "cancha ocupada sin aviso".**
  El problema original — nadie sabía con certeza si la cancha estaba
  libre. Éxito = que eso no vuelva a pasar.
- **Adopción real:** proporción de los ~105 domicilios con al menos un
  colono con cuenta activa, dado que es la única vía de acceso a la
  cancha hoy.
- **Cumplimiento de pago a tiempo:** proporción de reservaciones
  confirmadas por el tesorero antes del plazo, vs. liberadas
  automáticamente por falta de pago.
- **Reducción de carga operativa de la mesa directiva** frente al
  esquema anterior (coordinar por WhatsApp + encargado externo) —
  cualitativo, sin baseline numérico previo.

## 9. Seguridad y privacidad

### Control de acceso
- Producto privado, por invitación — no hay registro público. Todo
  colono es dado de alta por un admin/super-admin que ya lo vetó.
- Login sin contraseña: OTP por teléfono.
- Los cuatro roles (colono/tesorero/admin/super-admin) acotan qué
  puede ver y modificar cada quien — ver sección 6.

### Aplicación real de permisos
- La validación del lado del cliente es solo para UX (mensajes de
  error específicos, feedback inmediato) — la barrera real contra un
  cliente malicioso son las reglas de Firestore y Storage, que
  duplican deliberadamente la misma lógica de negocio.
- Las operaciones más sensibles (crear cuentas, eliminar cuentas,
  asignar roles) corren en Cloud Functions con Admin SDK, nunca como
  escritura directa del cliente — permite validación atómica y
  auditable del lado del servidor.

### Prevención de abuso
- App Check (reCAPTCHA v3) exigido en Auth, Firestore y Storage —
  bloquea tráfico que no venga de la app real.
- Rate limiting explícito en la creación de reservaciones (por
  usuario, ventana fija), para evitar spam en una función que tiene
  costo real.
- Alertas de presupuesto configuradas a nivel de facturación del
  proyecto.

### Privacidad de datos
- Datos recolectados: nombre, teléfono, domicilio dentro de la
  comunidad, y opcionalmente correo. Nada de información de pago —
  el pago ocurre fuera de la app.
- Un colono solo ve su propia información y sus propias reservaciones;
  roles con más acceso (tesorero/admin/super-admin) lo tienen
  explícitamente por la naturaleza de su función.
- Excepción deliberada: el nombre de los residentes de un domicilio es
  visible **antes** de autenticarse (para el saludo de bienvenida en
  login) — expone menos que el resto del perfil, y solo a quien ya
  conoce una dirección real dentro de la comunidad.

## 10. Analítica

**No implementado todavía — esta sección es spec, no estado actual.**

Objetivo: darle a admin y super-admin visibilidad de uso del sistema sin
depender de consultar Firestore manualmente. Vive como una vista de
estadísticas (totales fijos, sin selector de rango de fechas ni
desglose) dentro del panel de administración — no una herramienta
externa tipo Google Analytics, ya que los datos que importan ya viven
en Firestore y se pueden calcular directo de ahí sin costo adicional.

Métricas mínimas a mostrar:
- **Usuarios activos:** cantidad de colonos con cuenta activa (y su
  proporción sobre los ~105 domicilios de la comunidad).
- **Reservaciones por semana:** volumen de reservaciones creadas en la
  semana actual.
- **Pagos recaudados:** suma del monto de las reservaciones confirmadas
  como pagadas.

Esto conecta directo con las Métricas de éxito de la sección 8 — sin
esta vista, "adopción real" y "cumplimiento de pago a tiempo" solo se
pueden medir manual.

## 11. Arquitectura de navegación

Todo el mundo entra por login (domicilio → saludo por nombre → OTP por
teléfono) — no hay ninguna otra puerta de entrada activa. De ahí, el
recorrido depende del rol:

- **Colono:** aterriza en Home — reservar en la grilla de horarios, ver
  "Mis reservaciones", y acceso a Ayuda. Nada más le aparece en la
  navegación.
- **Tesorero:** además de lo anterior, un acceso a Pagos — lista de
  reservaciones pendientes de confirmar.
- **Admin:** además de lo de tesorero, un acceso a Admin — panel con
  pestañas de Reservaciones, Canchas y Usuarios.
- **Super-admin:** el mismo panel de Admin, más una pestaña adicional
  Avanzado (asignar roles, eliminar usuarios, logo, color, nombre del
  sitio).

Cualquier ruta desconocida o un intento de entrar a una sección sin el
rol necesario redirige de vuelta a Home — no hay pantallas de error
expuestas al usuario por permisos insuficientes.

## 12. Modelos de datos

_(Entidades conceptuales — el schema exacto de campos/tipos vive en
`CONTEXT.md` § Modelo de datos, no se repite aquí.)_

- **Usuario (colono):** una persona vinculada a un domicilio de la
  comunidad, con un rol (colono/tesorero/admin/super-admin) y un
  estado (pendiente/activo/rechazado).
- **Domicilio:** agrupa hasta 2 usuarios por dirección física — refleja
  la regla de la comunidad de máximo 2 colonos con cuenta por casa.
- **Cancha (recurso reservable):** una instalación con sus propias
  reglas de uso (horario, duración permitida, límite de reservaciones
  activas, anticipación, plazo de pago, tarifa). Hoy solo representa
  canchas de padel, pero el modelo no tiene nada específico de ese
  deporte — pensado para poder representar otro tipo de recurso (ver
  casa club, sección 14).
- **Reservación:** vincula un usuario, una cancha y un horario, y pasa
  por una máquina de estados que refleja su ciclo de vida real:
  *solicitada* (aparta el horario, pago pendiente) → *pagada*
  (confirmada por el tesorero) → *cancelada* o *finalizada*. Una
  reservación no pagada a tiempo se libera sola, sin intervención
  manual.
- **Configuración del sitio:** identidad de marca (nombre, logo, color
  de acento) y contacto — separada del perfil de cualquier usuario,
  vive como configuración global editable solo por super-admin.

## 13. Supuestos, restricciones y dependencias

### Supuestos
- La comunidad es de tamaño fijo y chico (~105 domicilios) — el
  producto no necesita diseñarse para escalar más allá de eso.
- El pago ocurre fuera de la plataforma; el sistema confía en que el
  tesorero confirme honestamente, no hay verificación automática de
  pago.
- Siempre habrá al menos un super-admin activo capaz de gestionar el
  sitio y asignar roles.

### Restricciones
- **Costo cercano a $0** es un objetivo explícito, no solo deseable —
  el proyecto está en plan de pago (Blaze) por necesitar Cloud
  Functions, mitigado con rate limiting y alertas de presupuesto.
- Firestore y Storage del proyecto viven en **ubicaciones distintas**
  — cualquier chequeo de permisos futuro que cruce ambos servicios
  debe usar custom claims en el token, no una consulta cruzada directa
  desde las reglas de Storage hacia Firestore (ver sección 9 y el
  incidente resuelto documentado en `AGENTS.md`).
- Las notificaciones por correo dependen de una extensión de Firebase
  instalada manualmente en el proyecto real, fuera del control del
  código del repo — no hay garantía de que esté activa.
- La vista principal de reservación asume hoy un único recurso
  reservable activo — relevante para la expansión a casa club (sección
  14).

### Dependencias
- Firebase como única infraestructura de backend (Auth, Firestore,
  Storage, Functions, Hosting, App Check) — sin servidor propio.
- reCAPTCHA v3, requerido por App Check.
- El grupo de WhatsApp de la comunidad sigue siendo el canal de
  comunicación informal en paralelo a la app — no se reemplaza.

## 14. Preguntas abiertas

- **Reservación de la casa club.** Llegó una solicitud real de habilitar
  esto en el mismo portal. Recomendación: mismo proyecto, no uno
  aparte — reutiliza Auth/Firestore/Storage/App Check ya provisionados
  (costo marginal ~$0) y evita que el colono necesite loguearse por
  separado en dos sistemas. Modelarla como otro doc en `courts` con un
  campo `type` (`'cancha' | 'casa-club'`) para distinguirla, ya que
  `Court`/`CourtSettings` no tiene nada específico de padel. Pendiente
  de resolver antes de implementar: hoy `useCourtData` asume una sola
  cancha activa — falta el selector de "qué recurso estoy reservando"
  en el Home.
- El Compromiso SLC de arriba ("sin excepciones documentadas") está en
  tensión directa con trabajo ya desplegado: las features de
  nombre-del-sitio/logo/color-de-acento (extensiones del Epic #43)
  dejaron a propósito `manifest.json`, los meta tags de `index.html`, y
  el template de email de registro fijos en "Padel Toscana" —
  documentado como limitación conocida en vez de arreglado. Bajo el
  estándar SLC tal como está definido, eso no califica como "complete".
  Decidir: arreglar esos huecos para de verdad cumplir el estándar, o
  tratar SLC como aplicable solo al trabajo hacia adelante.
