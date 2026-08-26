import { Timestamp } from 'firebase/firestore'

export interface CourtSettings {
  openTime: string
  closeTime: string
  minDurationHours: number
  maxDurationHours: number
  slotIntervalMinutes: number
  maxActiveReservationsPerUser: number
  daysAheadAllowed: number
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

export interface UserProfile {
  uid: string
  name: string
  phone?: string
  email?: string
  street: ValidStreet
  streetNumber: string
  address: string
  addressNormalized?: string
  isAdmin: boolean
  status?: UserStatus
  createdAt: Timestamp
}

export type ReservationStatus = 'active' | 'cancelled'

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
  createdAt: Timestamp
}
