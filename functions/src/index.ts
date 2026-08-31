// createReservation: única función original del repo (comentario abajo).
// adminCreateColono/getResidentsByAddress (final del archivo) son la
// segunda tanda — ver TASKS.md y functions/src/colonoRules.ts.
//
// Cierra el gap documentado en AGENTS.md
// ("Excepción conocida") y CONTEXT.md ("Gaps / deuda conocida"): el límite
// de reservaciones activas por usuario y la detección de traslapes de
// horario requieren queries agregadas que firestore.rules no puede hacer
// (solo get() de documentos puntuales) — antes solo se validaban del lado
// del cliente en src/services/reservations.ts, con un check-then-write NO
// atómico. Esta función corre con Admin SDK (bypasea firestore.rules) y
// hace el check + write dentro de una transacción de Firestore.
//
// firestore.rules ahora deniega `create` en reservations por completo
// (`allow create: if false`) — esta función es la ÚNICA vía legítima para
// crear una reservación. También deriva userId/userName/userAddress del
// lado del servidor (de request.auth.uid y users/{uid}) en vez de confiar
// en lo que mande el cliente — cierra un vector de spoofing adicional que
// el `addDoc` directo del cliente tenía antes.
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import {
  hasOverlap,
  countOccupyingReservations,
  OCCUPYING_STATUSES,
  isDurationWithinHardCap,
  isLeadTimeSufficient,
  isWithinMaxAdvanceWindow,
  isPlayerCountValid,
  isResidentInChargeNameValid,
  computePaymentDueAt,
} from './reservationRules'
import { toDate, addHours } from './time'
import { checkRateLimit, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_CALLS } from './rateLimit'
import { isValidStreet, isAddressAvailable, normalizeAddress, isValidColonoName, isValidMxPhone } from './colonoRules'

initializeApp()
const db = getFirestore()

interface CreateReservationInput {
  courtId: string
  date: string
  startTime: string
  durationHours: number
  playerCount: number
  residentInChargeName: string
}

// ¿`data` tiene la forma mínima esperada? No es una validación de negocio
// (esas vienen después, con mensajes de error específicos) — solo evita
// que un `undefined`/tipo equivocado tumbe la función con un error críptico.
function isValidInput(data: unknown): data is CreateReservationInput {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.courtId === 'string' &&
    typeof d.date === 'string' &&
    typeof d.startTime === 'string' &&
    typeof d.durationHours === 'number' &&
    typeof d.playerCount === 'number' &&
    typeof d.residentInChargeName === 'string'
  )
}

// Rechaza si el uid ya agotó su cupo de llamadas en la ventana actual
// (rateLimits/{uid} — ver rateLimit.ts). Corre en su propia transacción,
// antes de cualquier otra lectura, para que un abusador falle barato (1
// read + 1 write) en vez de pagar el costo completo de la validación de
// negocio en cada intento.
async function enforceRateLimit(uid: string): Promise<void> {
  const ref = db.doc(`rateLimits/${uid}`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const state = snap.exists
      ? { windowStart: (snap.get('windowStart') as Timestamp).toDate(), count: snap.get('count') as number }
      : null
    const result = checkRateLimit(state, new Date(), RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_CALLS)
    if (!result.allowed) {
      throw new HttpsError('resource-exhausted', 'rate-limited')
    }
    tx.set(ref, {
      windowStart: Timestamp.fromDate(result.nextState.windowStart),
      count: result.nextState.count,
    })
  })
}

export const createReservation = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'unauthenticated')
    }
    const uid = request.auth.uid
    await enforceRateLimit(uid)
    if (!isValidInput(request.data)) {
      throw new HttpsError('invalid-argument', 'invalid-argument')
    }
    const { courtId, date, startTime, durationHours, playerCount } = request.data
    const residentInChargeName = request.data.residentInChargeName.trim()

    const [userSnap, courtSnap] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`courts/${courtId}`).get(),
    ])

    if (!userSnap.exists) throw new HttpsError('failed-precondition', 'user-not-found')
    const user = userSnap.data() as { name: string; address: string; status?: string }
    if (user.status !== 'active') throw new HttpsError('failed-precondition', 'inactive-user')

    if (!courtSnap.exists) throw new HttpsError('failed-precondition', 'court-not-found')
    const court = courtSnap.data() as {
      settings: {
        closeTime: string
        maxActiveReservationsPerUser: number
        minLeadHours: number
        daysAheadAllowed: number
        paymentDeadlineHours: number
      }
    }

    const endTime = addHours(startTime, durationHours)

    if (endTime > court.settings.closeTime) throw new HttpsError('failed-precondition', 'outside-hours')
    if (!isDurationWithinHardCap(durationHours)) {
      throw new HttpsError('failed-precondition', 'duration-too-long')
    }
    if (!isPlayerCountValid(playerCount)) {
      throw new HttpsError('failed-precondition', 'invalid-player-count')
    }
    if (!isResidentInChargeNameValid(residentInChargeName)) {
      throw new HttpsError('failed-precondition', 'resident-in-charge-required')
    }

    const startAt = toDate(date, startTime)
    const endAt = toDate(date, endTime)
    const now = new Date()

    if (!isLeadTimeSufficient(startAt, now, court.settings.minLeadHours)) {
      throw new HttpsError('failed-precondition', 'lead-time-too-short')
    }
    if (!isWithinMaxAdvanceWindow(startAt, now, court.settings.daysAheadAllowed)) {
      throw new HttpsError('failed-precondition', 'too-far-ahead')
    }

    const newRef = db.collection('reservations').doc()

    await db.runTransaction(async (tx) => {
      // Reservaciones activas del usuario (límite maxActiveReservationsPerUser).
      const userQuery = db
        .collection('reservations')
        .where('userId', '==', uid)
        .where('status', 'in', OCCUPYING_STATUSES)
      const userReservationsSnap = await tx.get(userQuery)
      const userReservations = userReservationsSnap.docs.map((d) => ({ status: d.get('status') as string }))
      if (countOccupyingReservations(userReservations) >= court.settings.maxActiveReservationsPerUser) {
        throw new HttpsError('failed-precondition', 'max-reservations')
      }

      // Traslapes en la misma cancha/día.
      const dayQuery = db
        .collection('reservations')
        .where('courtId', '==', courtId)
        .where('date', '==', date)
        .where('status', 'in', OCCUPYING_STATUSES)
      const daySnap = await tx.get(dayQuery)
      const existing = daySnap.docs.map((d) => ({
        startTime: d.get('startTime') as string,
        endTime: d.get('endTime') as string,
      }))
      if (hasOverlap(existing, startTime, endTime)) {
        throw new HttpsError('failed-precondition', 'slot-taken')
      }

      tx.set(newRef, {
        courtId,
        userId: uid,
        userName: user.name,
        userAddress: user.address,
        date,
        startTime,
        endTime,
        durationHours,
        status: 'solicitada',
        startAt: Timestamp.fromDate(startAt),
        endAt: Timestamp.fromDate(endAt),
        paymentDueAt: Timestamp.fromDate(computePaymentDueAt(startAt, court.settings.paymentDeadlineHours)),
        playerCount,
        residentInChargeName,
        createdAt: FieldValue.serverTimestamp(),
      })
    })

    return { reservationId: newRef.id }
  },
)

// ── Alta de colonos por admin (ver TASKS.md) ────────────────────────────────
// Reemplaza el auto-registro como punto de entrada. registerUser() (cliente,
// src/services/users.ts) y su regla de creación en firestore.rules siguen
// intactos — solo dejaron de tener enlace desde LoginPage.

interface GetResidentsByAddressInput {
  street: string
  streetNumber: string
}

function isValidResidentsInput(data: unknown): data is GetResidentsByAddressInput {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return typeof d.street === 'string' && typeof d.streetNumber === 'string'
}

// Saludo pre-auth en LoginPage ("Bienvenid@ {nombre}"): dado un domicilio,
// ¿quién vive ahí? No requiere request.auth — corre antes de que la persona
// entre, protegida solo por enforceAppCheck (igual que sendPhoneOtp del
// lado de Auth). Regresa solo nombres, nunca uid/teléfono: addresses/{key}
// hoy solo expone uids opacos públicamente, y esta función no amplía eso.
export const getResidentsByAddress = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (request) => {
    if (!isValidResidentsInput(request.data)) {
      throw new HttpsError('invalid-argument', 'invalid-argument')
    }
    const { street, streetNumber } = request.data
    if (!isValidStreet(street)) {
      throw new HttpsError('invalid-argument', 'invalid-street')
    }
    const addressKey = normalizeAddress(street, streetNumber)
    const snap = await db
      .collection('users')
      .where('addressNormalized', '==', addressKey)
      .where('status', '==', 'active')
      .get()
    const names = snap.docs.map((d) => d.get('name') as string)
    return { names }
  },
)

interface AdminCreateColonoInput {
  name: string
  street: string
  streetNumber: string
  phone: string
}

function isValidCreateColonoInput(data: unknown): data is AdminCreateColonoInput {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.name === 'string' &&
    typeof d.street === 'string' &&
    typeof d.streetNumber === 'string' &&
    typeof d.phone === 'string'
  )
}

// El admin da de alta a un colono directamente. Crea la cuenta de Auth
// (Admin SDK — el navegador no puede crear cuentas ajenas) + el doc de
// Firestore, con el mismo shape que registerUser() escribiría, pero con
// status 'active' de inmediato: el admin ya lo está vetando a mano, no hace
// falta el paso de aprobación del auto-registro.
export const adminCreateColono = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'unauthenticated')
    }
    const callerSnap = await db.doc(`users/${request.auth.uid}`).get()
    const callerRole = callerSnap.get('role')
    // Crear colonos no es "asignar roles" (eso es exclusivo de super-admin,
    // ver Epic #43) — sigue disponible para ambos.
    if (!callerSnap.exists || (callerRole !== 'admin' && callerRole !== 'super-admin')) {
      throw new HttpsError('permission-denied', 'admin-only')
    }
    if (!isValidCreateColonoInput(request.data)) {
      throw new HttpsError('invalid-argument', 'invalid-argument')
    }
    const { street, streetNumber, phone } = request.data
    const name = request.data.name.trim()

    if (!isValidColonoName(name)) throw new HttpsError('invalid-argument', 'invalid-name')
    if (!isValidStreet(street)) throw new HttpsError('invalid-argument', 'invalid-street')
    if (!streetNumber.trim()) throw new HttpsError('invalid-argument', 'invalid-street-number')
    if (!isValidMxPhone(phone)) throw new HttpsError('invalid-argument', 'invalid-phone')

    const addressKey = normalizeAddress(street, streetNumber)
    const addressRef = db.doc(`addresses/${addressKey}`)

    // Pre-check fuera de transacción: falla rápido y barato antes de tocar
    // Auth si el domicilio ya está al tope.
    const preCheckSnap = await addressRef.get()
    const preCheckUids: string[] = preCheckSnap.exists ? (preCheckSnap.get('uids') as string[]) : []
    if (!isAddressAvailable(preCheckUids)) {
      throw new HttpsError('failed-precondition', 'address-full')
    }

    let newUid: string
    try {
      const authUser = await getAuth().createUser({ phoneNumber: phone, displayName: name })
      newUid = authUser.uid
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/phone-number-already-exists') {
        throw new HttpsError('already-exists', 'phone-already-registered')
      }
      throw err
    }

    const userRef = db.doc(`users/${newUid}`)
    const address = `${street} ${streetNumber.trim()}`

    try {
      await db.runTransaction(async (tx) => {
        const addressSnap = await tx.get(addressRef)
        const uids: string[] = addressSnap.exists ? (addressSnap.get('uids') as string[]) : []
        // Re-chequeo dentro de la transacción: protege contra una carrera
        // entre el pre-check y este punto (dos altas concurrentes al mismo
        // domicilio).
        if (!isAddressAvailable(uids)) {
          throw new HttpsError('failed-precondition', 'address-full')
        }
        tx.set(userRef, {
          name,
          street,
          streetNumber: streetNumber.trim(),
          address,
          addressNormalized: addressKey,
          phone,
          email: null,
          role: 'colono',
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
        })
        tx.set(addressRef, { uids: [...new Set([...uids, newUid])] }, { merge: true })
      })
    } catch (err) {
      // No dejar una cuenta de Auth huérfana si el write de Firestore no
      // se hizo (best-effort — no enmascarar el error original si esto
      // también falla).
      await getAuth().deleteUser(newUid).catch(() => {})
      throw err
    }

    return { uid: newUid }
  },
)

// Elimina una cuenta por completo: cuenta de Auth + doc de Firestore +
// libera el cupo en addresses/{key}. Exclusivo de super-admin — a
// diferencia de adminCreateColono, aquí sí importa la distinción con
// admin (eliminar cuentas es más sensible que darlas de alta). Rechazar
// un registro pendiente sigue siendo cosa de cualquier admin, sin pasar
// por esta función (rejectUser() en src/services/users.ts, directo desde
// el cliente — ver la rama `status == 'pending'` en firestore.rules).
//
// Orden deliberado: primero el doc de Firestore + el cupo del domicilio,
// después la cuenta de Auth (al revés que adminCreateColono). Si el borrado
// de Auth falla después de que el doc ya se borró, el peor caso es una
// cuenta de Auth huérfana sin perfil — el propio AuthContext ya maneja ese
// caso con gracia (perfil null → "contacta al admin"). Si fuera al revés
// (Auth primero) y el doc de Firestore no se lograra borrar, quedaría un
// usuario "fantasma" visible en el panel admin con una cuenta de Auth que
// ya no existe — mucho más confuso y sin cupo liberado en el domicilio.
export const adminDeleteColono = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'unauthenticated')
    }
    const callerSnap = await db.doc(`users/${request.auth.uid}`).get()
    if (!callerSnap.exists || callerSnap.get('role') !== 'super-admin') {
      throw new HttpsError('permission-denied', 'super-admin-only')
    }

    const uid = (request.data as { uid?: unknown })?.uid
    if (typeof uid !== 'string' || !uid) {
      throw new HttpsError('invalid-argument', 'invalid-argument')
    }
    // Espejo de canActOnUser() en src/services/userRules.ts — un super-admin
    // no puede eliminarse a sí mismo (evita que el sitio se quede sin
    // ningún super-admin, ya que no hay UI para asignar el rol de vuelta).
    if (uid === request.auth.uid) {
      throw new HttpsError('failed-precondition', 'cannot-delete-self')
    }

    const userRef = db.doc(`users/${uid}`)
    const userSnap = await userRef.get()
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'user-not-found')
    }
    const addressNormalized = userSnap.get('addressNormalized') as string | undefined

    await db.runTransaction(async (tx) => {
      if (addressNormalized) {
        const addressRef = db.doc(`addresses/${addressNormalized}`)
        const addressSnap = await tx.get(addressRef)
        if (addressSnap.exists) {
          const uids = (addressSnap.get('uids') as string[]).filter((u) => u !== uid)
          tx.update(addressRef, { uids })
        }
      }
      tx.delete(userRef)
    })

    // Best-effort: si la cuenta de Auth ya no existe (o el borrado falla),
    // el doc de Firestore y el cupo del domicilio ya quedaron consistentes
    // arriba — ver nota de orden deliberado más arriba.
    await getAuth().deleteUser(uid).catch((err) => {
      if ((err as { code?: string }).code !== 'auth/user-not-found') throw err
    })

    return { success: true }
  },
)

const VALID_ROLES = ['colono', 'admin', 'tesorero', 'super-admin']

// Asignar rol es exclusivo de super-admin (Epic #43). Antes esto era un
// write directo del cliente a users/{uid} (bloqueado del lado de
// firestore.rules) — ahora pasa por Cloud Function porque ADEMÁS de
// actualizar el doc, setea un custom claim en el token de Auth
// (getAuth().setCustomUserClaims): storage.rules necesita el rol de
// alguna forma que no dependa de `firestore.get()` (Cross Service Rules),
// que requiere que Firestore y Storage estén en la MISMA ubicación —
// este proyecto los tiene en ubicaciones distintas (Firestore `nam5`,
// Storage `us-central1`, ver `gcloud firestore databases describe` /
// `gcloud storage buckets describe`) y ese cross-service call simplemente
// no funciona ahí: causaba "permission denied" al subir el logo aunque
// el rol en Firestore fuera correcto (diagnosticado probando en vivo
// contra producción). Custom claims no tienen ese problema — vive en el
// token, no requiere ninguna llamada cross-service.
//
// Los custom claims no llegan al cliente hasta el próximo refresh del ID
// token (cerrar/abrir sesión, o `user.getIdToken(true)`) — alguien recién
// promovido ve su rol nuevo en la UI de inmediato (esa parte lee
// Firestore), pero necesita refrescar sesión antes de que storage.rules
// lo reconozca.
export const adminSetUserRole = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'unauthenticated')
    }
    const callerSnap = await db.doc(`users/${request.auth.uid}`).get()
    if (!callerSnap.exists || callerSnap.get('role') !== 'super-admin') {
      throw new HttpsError('permission-denied', 'super-admin-only')
    }

    const { uid, role } = (request.data ?? {}) as { uid?: unknown; role?: unknown }
    if (typeof uid !== 'string' || !uid || typeof role !== 'string' || !VALID_ROLES.includes(role)) {
      throw new HttpsError('invalid-argument', 'invalid-argument')
    }
    // Espejo de canActOnUser() en src/services/userRules.ts — un
    // super-admin no puede cambiarse el rol a sí mismo.
    if (uid === request.auth.uid) {
      throw new HttpsError('failed-precondition', 'cannot-change-own-role')
    }

    const userRef = db.doc(`users/${uid}`)
    const userSnap = await userRef.get()
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'user-not-found')
    }

    await userRef.update({ role })
    await getAuth().setCustomUserClaims(uid, { role })

    return { success: true }
  },
)
