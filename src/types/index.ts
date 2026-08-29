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
}

export interface Court {
  id: string
  name: string
  isActive: boolean
  settings: CourtSettings
}

export const VALID_STREETS = ['Nogal', 'Olivos', 'Encino'] as const
export type ValidStreet = (typeof VALID_STREETS)[number]

export type UserStatus = 'pending' | 'active' | 'rejected'

// colono: reserva/cancela sus propias reservaciones.
// admin: aprueba/rechaza registros, gestiona canchas, ve/gestiona todas las
//   reservaciones, cambia el rol de otros usuarios.
// tesorero: confirma pagos de reservaciones (issue 7/7 del épico #10).
export type UserRole = 'colono' | 'admin' | 'tesorero'

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

// solicitada: recién creada, ocupa el horario, pendiente de pago.
// pagada: el tesorero confirmó el pago — sigue ocupando el horario.
// cancelada: el dueño o un admin la canceló (o se liberó por falta de pago,
//   issue 4/7 del épico #10) — ya no ocupa el horario.
// finalizada: ya pasó (issue 4/7) — ya no ocupa el horario.
// "Ocupar el horario" = cuenta para traslapes y para el límite de
// reservaciones activas por usuario — ver OCCUPYING_STATUSES en
// src/services/reservationRules.ts.
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
  // el auto-release por falta de pago (issue 4/7).
  startAt: Timestamp
  endAt: Timestamp
  createdAt: Timestamp
}
