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
// lado del servidor (beneficiario autorizado y users/{uid}) en vez de confiar
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
  isWithinMonthlyLimit,
  matchesCourtType,
  isResidentInChargeNameValid,
  computePaymentDueAt,
  isVisibleOnPublicCalendar,
} from './reservationRules'
import { toDate, addHours, monthDateRange } from './time'
import { bookingPermissionError, isValidBookingTarget } from './bookingRules'
import {
  checkRateLimit,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_CALLS,
  LOOKUP_RATE_LIMIT_WINDOW_MS,
  LOOKUP_RATE_LIMIT_MAX_CALLS,
  lookupRateLimitKey,
} from './rateLimit'
import { isValidStreet, isAddressAvailable, normalizeAddress, isValidColonoName, isValidMxPhone } from './colonoRules'
import { MAX_BULK_COLONOS, validateBulkColono, type BulkColonoInput } from './bulkColonoRules'

initializeApp()
const db = getFirestore()

interface CreateReservationInput {
  targetUserId?: string
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
    typeof d.residentInChargeName === 'string' &&
    isValidBookingTarget(d.targetUserId)
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

/** Limita consultas pre-auth por IP sin almacenar la IP legible en Firestore. */
async function enforceLookupRateLimit(ip: string): Promise<void> {
  const ref = db.doc(`lookupRateLimits/${lookupRateLimitKey(ip)}`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const state = snap.exists
      ? { windowStart: (snap.get('windowStart') as Timestamp).toDate(), count: snap.get('count') as number }
      : null
    const result = checkRateLimit(state, new Date(), LOOKUP_RATE_LIMIT_WINDOW_MS, LOOKUP_RATE_LIMIT_MAX_CALLS)
    if (!result.allowed) throw new HttpsError('resource-exhausted', 'rate-limited')
    tx.set(ref, {
      windowStart: Timestamp.fromDate(result.nextState.windowStart),
      count: result.nextState.count,
    })
  })
}

/** Crea para el actor o un colono autorizado; conserva reglas comunes y registra al actor real. */
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
    const { courtId, date, playerCount } = request.data
    const residentInChargeName = request.data.residentInChargeName.trim()

    const targetUserId = request.data.targetUserId
    const ownerUid = targetUserId ?? uid
    const courtSnap = await db.doc(`courts/${courtId}`).get()

    if (!courtSnap.exists) throw new HttpsError('failed-precondition', 'court-not-found')
    const court = courtSnap.data() as {
      type?: 'cancha' | 'casa-club'
      settings: {
        openTime: string
        closeTime: string
        minDurationHours: number
        maxActiveReservationsPerUser: number
        minLeadHours: number
        daysAheadAllowed: number
        paymentDeadlineHours: number
        maxPlayerCount?: number
        maxReservationsPerUserPerMonth?: number
      }
    }
    // Fallback ?? 'cancha' — mismo patrón que el resto de campos nuevos del
    // épico #60 (issue 1/8), para canchas creadas antes de esta migración.
    const courtType = court.type ?? 'cancha'
    const isCasaClub = courtType === 'casa-club'

    // Casa club es reservación de día completo (issue 2/8): ignora
    // startTime/durationHours del cliente y deriva el bloque fijo desde
    // settings, para que el cliente no pueda mandar un horario parcial para
    // este tipo de recurso.
    const startTime = isCasaClub ? court.settings.openTime : request.data.startTime
    const durationHours = isCasaClub ? court.settings.minDurationHours : request.data.durationHours
    const endTime = addHours(startTime, durationHours)

    // outside-hours no aplica a casa club: su "endTime" (issue 6/8 del
    // épico #60) es openTime + minDurationHours (24h) con aritmética de
    // addHours() ('00:00' + 24h = '24:00'), que siempre es mayor a
    // closeTime ('23:59', el valor de display de "todo el día") aunque la
    // reservación sea legítima — el chequeo existe para evitar que una
    // reservación de cancha se salga del horario de apertura, algo que no
    // aplica a un recurso de día completo fijo.
    if (!isCasaClub && endTime > court.settings.closeTime) {
      throw new HttpsError('failed-precondition', 'outside-hours')
    }
    // El tope duro de 2h es del reglamento de colonos para cancha — no
    // aplica a casa club, cuya duración (24h) viene fija de settings, no del
    // cliente.
    if (!isCasaClub && !isDurationWithinHardCap(durationHours)) {
      throw new HttpsError('failed-precondition', 'duration-too-long')
    }
    if (!isPlayerCountValid(playerCount, court.settings.maxPlayerCount)) {
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
      // Permisos y beneficiario se leen en la misma transacción que la reserva:
      // una baja o cambio de rol concurrente obliga a revalidar antes del write.
      const actorSnap = await tx.get(db.doc(`users/${uid}`))
      const ownerSnap = ownerUid === uid ? actorSnap : await tx.get(db.doc(`users/${ownerUid}`))
      const actor = actorSnap.exists ? actorSnap.data() as { role?: string; status?: string } : null
      const owner = ownerSnap.exists
        ? ownerSnap.data() as { name: string; address: string; role?: string; status?: string }
        : null
      const permissionError = bookingPermissionError(actor, targetUserId, owner)
      if (permissionError) {
        throw new HttpsError(permissionError === 'admin-only' ? 'permission-denied' : 'failed-precondition', permissionError)
      }
      if (!owner) throw new HttpsError('failed-precondition', 'user-not-found')

      // Reservaciones activas del usuario (límite maxActiveReservationsPerUser),
      // filtradas por courtType EN MEMORIA (no en la query): sin este
      // filtro, un colono con sus reservaciones de cancha al tope quedaría
      // bloqueado de reservar la casa club también sin haberla usado nunca,
      // y viceversa (bug encontrado durante la investigación del épico #60,
      // issue 3/8). Filtrar con `.where('courtType', ...)` excluiría además
      // las reservaciones ya existentes en producción sin ese campo — por
      // eso el filtro va en JS con el mismo fallback `?? 'cancha'` que el
      // resto de campos nuevos del épico (issue 1/8), no en la query.
      const userQuery = db
        .collection('reservations')
        .where('userId', '==', ownerUid)
        .where('status', 'in', OCCUPYING_STATUSES)
      const userReservationsSnap = await tx.get(userQuery)
      const userReservations = userReservationsSnap.docs
        .filter((d) => matchesCourtType(d.get('courtType') as string | undefined, courtType))
        .map((d) => ({
          status: d.get('status') as string,
          startAt: (d.get('startAt') as Timestamp).toDate(),
        }))
      if (countOccupyingReservations(userReservations) >= court.settings.maxActiveReservationsPerUser) {
        throw new HttpsError('failed-precondition', 'max-reservations')
      }
      // Tope mensual (issue 2/8), exclusivo de casa club — cancha no tiene
      // ventana de tiempo, solo el límite de activas de arriba.
      if (isCasaClub && court.settings.maxReservationsPerUserPerMonth != null) {
        if (!isWithinMonthlyLimit(userReservations, court.settings.maxReservationsPerUserPerMonth, now)) {
          throw new HttpsError('failed-precondition', 'monthly-limit')
        }
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
        courtType,
        userId: ownerUid,
        createdByUid: uid,
        userName: owner.name,
        userAddress: owner.address,
        date,
        startTime,
        endTime,
        durationHours,
        status: 'solicitada',
        startAt: Timestamp.fromDate(startAt),
        endAt: Timestamp.fromDate(endAt),
        paymentDueAt: Timestamp.fromDate(computePaymentDueAt(courtType, startAt, now, court.settings.paymentDeadlineHours)),
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
    await enforceLookupRateLimit(request.rawRequest.ip ?? 'unknown')
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

interface AdminBulkCreateColonosInput {
  colonos: BulkColonoInput[]
  confirm: boolean
}

interface BulkColonoResult {
  index: number
  name: string
  status: 'ready' | 'created' | 'skipped'
  message: string
}

/** Comprueba el límite y la forma mínima antes de procesar un lote administrativo. */
function isValidBulkCreateInput(data: unknown): data is AdminBulkCreateColonosInput {
  if (typeof data !== 'object' || data === null) return false
  const value = data as Record<string, unknown>
  return Array.isArray(value.colonos) && value.colonos.length > 0 && value.colonos.length <= MAX_BULK_COLONOS && typeof value.confirm === 'boolean'
}

/**
 * Previsualiza o crea colonos desde el formato JSON administrativo. El modo
 * de vista previa no escribe nada; al confirmar, revalida cada fila y el cupo
 * dentro de transacciones para que el resultado no dependa de la UI.
 */
export const adminBulkCreateColonos = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'unauthenticated')
    const callerSnap = await db.doc(`users/${request.auth.uid}`).get()
    const callerRole = callerSnap.get('role')
    if (!callerSnap.exists || (callerRole !== 'admin' && callerRole !== 'super-admin')) {
      throw new HttpsError('permission-denied', 'admin-only')
    }
    if (!isValidBulkCreateInput(request.data)) {
      throw new HttpsError('invalid-argument', 'invalid-bulk-input')
    }

    const { colonos, confirm } = request.data
    const results: BulkColonoResult[] = []
    // Refleja también las filas anteriores del mismo archivo, para detectar
    // cupos agotados sin tener que escribir durante la vista previa.
    const reservedAddressSlots = new Map<string, number>()
    const reservedPhones = new Set<string>()

    for (const [index, row] of colonos.entries()) {
      const validated = validateBulkColono(row)
      if (!validated.ok) {
        results.push({ index, name: '', status: 'skipped', message: validated.reason })
        continue
      }
      const colono = validated.colono
      if (reservedPhones.has(colono.phone)) {
        results.push({ index, name: colono.name, status: 'skipped', message: 'El teléfono se repite en el archivo.' })
        continue
      }
      const existingAuthUser = await getAuth().getUserByPhoneNumber(colono.phone).catch(() => null)
      if (existingAuthUser) {
        results.push({ index, name: colono.name, status: 'skipped', message: 'El teléfono ya tiene una cuenta.' })
        continue
      }

      const addressRef = db.doc(`addresses/${colono.addressKey}`)
      const addressSnap = await addressRef.get()
      const existingUids: string[] = addressSnap.exists ? (addressSnap.get('uids') as string[]) : []
      const reserved = reservedAddressSlots.get(colono.addressKey) ?? 0
      if (!isAddressAvailable([...existingUids, ...Array(reserved)])) {
        results.push({ index, name: colono.name, status: 'skipped', message: 'El domicilio ya tiene 2 colonos.' })
        continue
      }

      if (!confirm) {
        reservedAddressSlots.set(colono.addressKey, reserved + 1)
        reservedPhones.add(colono.phone)
        results.push({ index, name: colono.name, status: 'ready', message: 'Listo para crear.' })
        continue
      }

      let uid: string
      try {
        uid = (await getAuth().createUser({ phoneNumber: colono.phone, displayName: colono.name })).uid
      } catch (err) {
        const isDuplicate = (err as { code?: string }).code === 'auth/phone-number-already-exists'
        results.push({ index, name: colono.name, status: 'skipped', message: isDuplicate ? 'El teléfono ya tiene una cuenta.' : 'No se pudo crear la cuenta.' })
        continue
      }

      try {
        await db.runTransaction(async (tx) => {
          const latestAddress = await tx.get(addressRef)
          const uids: string[] = latestAddress.exists ? (latestAddress.get('uids') as string[]) : []
          if (!isAddressAvailable(uids)) throw new HttpsError('failed-precondition', 'address-full')
          tx.set(db.doc(`users/${uid}`), {
            name: colono.name,
            street: colono.street,
            streetNumber: colono.streetNumber,
            address: `${colono.street} ${colono.streetNumber}`,
            addressNormalized: colono.addressKey,
            phone: colono.phone,
            email: colono.email,
            role: 'colono',
            status: 'active',
            createdAt: FieldValue.serverTimestamp(),
          })
          tx.set(addressRef, { uids: [...new Set([...uids, uid])] }, { merge: true })
        })
        results.push({ index, name: colono.name, status: 'created', message: 'Creado.' })
        reservedPhones.add(colono.phone)
      } catch (err) {
        await getAuth().deleteUser(uid).catch(() => {})
        const isFull = err instanceof HttpsError && err.message === 'address-full'
        results.push({ index, name: colono.name, status: 'skipped', message: isFull ? 'El domicilio se llenó antes de crear esta fila.' : 'No se pudo guardar el perfil.' })
      }
    }

    return { results }
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

// ── Calendario público (issue 8/8 del épico #60, generalizado a cancha) ────
// Primera excepción deliberada al modelo "100% privado por invitación" del
// sitio — ver PRD.md § 9 (Seguridad y privacidad). Pensada para
// compartirse como link directo en el grupo de WhatsApp/con el guardia,
// sin sesión iniciada. Nació exclusiva de casa club (issue 8/8); se
// generalizó a cancha después, mismo criterio de privacidad — ver PRD.md.

const PUBLIC_CALENDAR_COURT_TYPES = ['cancha', 'casa-club'] as const
type PublicCalendarCourtType = (typeof PUBLIC_CALENDAR_COURT_TYPES)[number]

interface GetPublicCalendarInput {
  year: number
  month: number
  courtType: PublicCalendarCourtType
}

function isValidCalendarInput(data: unknown): data is GetPublicCalendarInput {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.year === 'number' &&
    Number.isInteger(d.year) &&
    typeof d.month === 'number' &&
    Number.isInteger(d.month) &&
    d.month >= 1 &&
    d.month <= 12 &&
    typeof d.courtType === 'string' &&
    (PUBLIC_CALENDAR_COURT_TYPES as readonly string[]).includes(d.courtType)
  )
}

// No requiere request.auth (mismo patrón que getResidentsByAddress) — es la
// ruta pública. NUNCA expone `firestore.rules` de `reservations` a lectura
// pública para lograr esto: eso filtraría status de pago/depósito de
// cualquier reservación (de cualquier recurso) a quien tenga el link. En
// vez de eso, esta función corre con Admin SDK y solo regresa los campos
// que el calendario necesita mostrar — incluye startTime/endTime porque
// cancha (a diferencia de casa club) puede tener varias reservaciones el
// mismo día; el cliente decide si los muestra ("Día completo" para casa
// club, rango de horario para cancha).
export const getPublicCalendar = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (request) => {
    if (!isValidCalendarInput(request.data)) {
      throw new HttpsError('invalid-argument', 'invalid-argument')
    }
    const { year, month, courtType } = request.data

    const courtsSnap = await db.collection('courts').where('type', '==', courtType).limit(1).get()
    if (courtsSnap.empty) {
      return { reservations: [] }
    }
    const courtId = courtsSnap.docs[0].id

    const { firstDay, lastDay } = monthDateRange(year, month)
    const reservationsSnap = await db
      .collection('reservations')
      .where('courtId', '==', courtId)
      .where('date', '>=', firstDay)
      .where('date', '<=', lastDay)
      .get()

    const reservations = reservationsSnap.docs
      .map((d) => ({
        date: d.get('date') as string,
        status: d.get('status') as string,
        startTime: d.get('startTime') as string,
        endTime: d.get('endTime') as string,
        name: d.get('residentInChargeName') as string,
        address: d.get('userAddress') as string,
      }))
      .filter((r) => isVisibleOnPublicCalendar(r.status))
      .map(({ date, startTime, endTime, name, address }) => ({ date, startTime, endTime, name, address }))

    return { reservations }
  },
)
