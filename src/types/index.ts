import { Timestamp } from 'firebase/firestore'

export interface CourtSettings {
  openTime: string
  closeTime: string
  minDurationHours: number
  maxDurationHours: number
  slotIntervalMinutes: number
  maxActiveReservationsPerUser: number
  daysAheadAllowed: number
  // Anticipación mínima para poder reservar, en horas. Default 24 (ver
  // reglamento de colonos, issue 3/7 del épico #10).
  minLeadHours: number
  // Horas desde que se crea la reservación hasta que se libera si nadie
  // confirma el pago (paymentDueAt = startAt - paymentDeadlineHours).
  // Default 12. Ver effectiveStatus() en reservationRules.ts (issue 4/7).
  paymentDeadlineHours: number
  // Monto en pesos que el colono debe pagar al tesorero para confirmar la
  // reservación. Default sugerido 300. Editable por admin (issue 6/7 del
  // épico #10) — aquí solo se declara el campo y se usa para mostrarlo.
  reservationFee: number
  // Máximo de asistentes por reservación. Reemplaza la constante fija
  // MAX_PLAYER_COUNT de reservationRules.ts (issue 2/8 del épico #60) —
  // opcional para no requerir migración de canchas ya creadas; los sitios
  // que lean este campo deben usar `?? MAX_PLAYER_COUNT` como fallback.
  // Default 10 en cancha, 30 en casa club.
  maxPlayerCount?: number
  // ── Campos exclusivos de casa club (issue 1/8 del épico #60) ───────────
  // No aplican a canchas de padel — quedan undefined/sin usar ahí.
  // Depósito que se paga al reservar y monto reembolsable de ese depósito
  // tras el evento (ver issue 4/8: devolución o retención del depósito).
  depositAmount?: number
  depositRefundableAmount?: number
  // Plazo mínimo antes del evento para poder cancelar, en horas (issue
  // 5/8). Cancha no lo usa — se puede cancelar en cualquier momento.
  cancellationDeadlineHours?: number
  // Tope de reservaciones de este recurso por usuario por mes calendario
  // (issue 2/8). Cancha no lo usa — su tope es maxActiveReservationsPerUser
  // (global, sin ventana de tiempo).
  maxReservationsPerUserPerMonth?: number
}

export type CourtType = 'cancha' | 'casa-club'

export interface Court {
  id: string
  name: string
  isActive: boolean
  settings: CourtSettings
  // Opcional para no requerir migración de canchas ya creadas antes del
  // épico #60 — los sitios que lean este campo deben usar `?? 'cancha'`
  // como fallback (mismo patrón que UserProfile.status ?? 'active').
  type?: CourtType
}

export const VALID_STREETS = ['Nogal', 'Olivo', 'Encino'] as const
export type ValidStreet = (typeof VALID_STREETS)[number]

export type UserStatus = 'pending' | 'active' | 'rejected'

// colono: reserva/cancela sus propias reservaciones.
// admin: aprueba/rechaza registros, gestiona canchas, ve/gestiona todas las
//   reservaciones. Ya no cambia el rol de otros usuarios — eso quedó
//   exclusivo de super-admin (Epic #43).
// tesorero: confirma pagos de reservaciones (issue 7/7 del épico #10).
// super-admin: superset de admin (entra al panel normal también) + panel
//   avanzado propio (asignar roles, logo del sitio, color de acento — ver
//   Epic #43 en GitHub).
export type UserRole = 'colono' | 'admin' | 'tesorero' | 'super-admin'

export interface UserProfile {
  uid: string
  name: string
  phone?: string
  email?: string
  street: ValidStreet
  streetNumber: string
  address: string
  addressNormalized?: string
  role: UserRole
  status?: UserStatus
  createdAt: Timestamp
}

// solicitada: recién creada, ocupa el horario, pendiente de pago. Se
//   libera (efectivamente 'cancelada') si nadie confirma el pago antes de
//   paymentDueAt — ver effectiveStatus() en reservationRules.ts.
// pagada: el tesorero confirmó el pago — sigue ocupando el horario.
// cancelada: el dueño/admin la canceló, o se liberó por falta de pago.
//   Ya no ocupa el horario.
// finalizada: ya pasó su horario (endAt) estando pagada. Ya no ocupa el
//   horario.
// "Ocupar el horario" = cuenta para traslapes y para el límite de
// reservaciones activas por usuario — ver OCCUPYING_STATUSES en
// src/services/reservationRules.ts.
//
// El status guardado en Firestore puede estar desactualizado respecto al
// tiempo real — no hay Cloud Functions que lo actualicen en el momento
// exacto en que expira. Cualquier código que lea reservaciones debe usar
// effectiveStatus(reservation, now), no el campo `status` crudo, para
// disponibilidad/conteos. src/services/reservations.ts ya hace esto en
// las funciones de lectura y además escribe el status corregido de forma
// oportunista cuando lo detecta.
export type ReservationStatus = 'solicitada' | 'pagada' | 'cancelada' | 'finalizada'

export interface Reservation {
  id: string
  courtId: string
  userId: string
  userName: string
  userAddress: string
  date: string
  startTime: string
  endTime: string
  durationHours: number
  status: ReservationStatus
  // Timestamps derivados de date+startTime/endTime al crear. Existen
  // además de los strings porque firestore.rules no puede comparar
  // request.time de forma confiable contra strings 'HH:mm' — con
  // Timestamp sí se puede validar anticipación mínima/máxima al crear, y
  // el auto-release por falta de pago.
  startAt: Timestamp
  endAt: Timestamp
  // startAt - court.settings.paymentDeadlineHours, calculado al crear.
  // Deadline para que el tesorero confirme el pago antes de que se libere
  // el horario — ver effectiveStatus() en reservationRules.ts.
  paymentDueAt: Timestamp
  // Total de asistentes (1–10), no solo los que caben jugando a la vez —
  // el máximo de 4 en cancha es solo informativo en la UI, no se valida.
  playerCount: number
  // Nombre del residente a cargo de la reservación. Default: profile.name
  // del usuario que reserva, pero editable como texto libre por si la va a
  // usar alguien más del domicilio — no hay selector de usuarios.
  residentInChargeName: string
  createdAt: Timestamp
}
