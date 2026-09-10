import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  actorRole: 'admin',
  actorStatus: 'active',
  residentStatus: 'active',
  residentExists: true,
  reservationCount: 0,
  limit: 2,
  overlap: false,
  writes: [] as { path: string; data: Record<string, unknown> }[],
  queriedOwner: '',
  rateLimitUid: '',
}))

vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_options: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {
    constructor(public code: string, message: string) { super(message) }
  },
}))
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }))
vi.mock('firebase-admin/firestore', () => {
  const snap = (data: Record<string, unknown> | null) => ({ exists: data !== null, data: () => data, get: (key: string) => data?.[key] })
  const settings = { openTime: '08:00', closeTime: '22:00', minDurationHours: 1, maxActiveReservationsPerUser: 2, minLeadHours: 24, daysAheadAllowed: 30, paymentDeadlineHours: 12, maxPlayerCount: 10 }
  const read = async (ref: { path: string; filters?: Record<string, unknown> }) => {
    if (ref.path.startsWith('rateLimits/')) {
      state.rateLimitUid = ref.path.split('/')[1]
      return snap(null)
    }
    if (ref.path === 'users/actor') return snap({ name: 'Admin', address: 'Nogal 1', role: state.actorRole, status: state.actorStatus })
    if (ref.path === 'users/resident') return snap(state.residentExists ? { name: 'Colono', address: 'Olivo 22', role: 'colono', status: state.residentStatus } : null)
    if (ref.path === 'courts/court') return snap({ type: 'cancha', settings: { ...settings, maxActiveReservationsPerUser: state.limit } })
    if (ref.filters?.userId) {
      state.queriedOwner = String(ref.filters.userId)
      return { docs: Array.from({ length: state.reservationCount }, () => snap({ courtType: 'cancha', status: 'pagada', startAt: { toDate: () => new Date('2026-09-15T12:00:00') } })) }
    }
    return { docs: state.overlap ? [snap({ startTime: '10:00', endTime: '11:00' })] : [] }
  }
  const db = {
    doc: (path: string) => ({ path, get: () => read({ path }) }),
    collection: (path: string) => {
      const query = {
        path, filters: {} as Record<string, unknown>,
        where(key: string, _operator: string, value: unknown) { this.filters[key] = value; return this },
        doc: () => ({ path: `${path}/new-reservation`, id: 'new-reservation' }),
      }
      return query
    },
    runTransaction: (handler: (tx: unknown) => unknown) => handler({
      get: read,
      set: (ref: { path: string }, data: Record<string, unknown>) => { state.writes.push({ path: ref.path, data }) },
    }),
  }
  return { getFirestore: () => db, Timestamp: { fromDate: (date: Date) => date }, FieldValue: { serverTimestamp: () => 'server-time' } }
})

import { createReservation } from './index'

const call = createReservation as unknown as (request: { auth?: { uid: string }; data: Record<string, unknown> }) => Promise<unknown>
const input = { courtId: 'court', date: '2026-09-15', startTime: '10:00', durationHours: 1, playerCount: 4, residentInChargeName: 'Colono', targetUserId: 'resident' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-09T10:00:00'))
  Object.assign(state, { actorRole: 'admin', actorStatus: 'active', residentStatus: 'active', residentExists: true, reservationCount: 0, limit: 2, overlap: false, writes: [], queriedOwner: '', rateLimitUid: '' })
})

afterEach(() => { vi.useRealTimers() })

describe('createReservation: beneficiario y autoridad del servidor', () => {
  it.each(['admin', 'super-admin'])('crea para el beneficiario como %s y limita llamadas del actor', async (role) => {
    state.actorRole = role
    await call({ auth: { uid: 'actor' }, data: input })
    expect(state.queriedOwner).toBe('resident')
    expect(state.rateLimitUid).toBe('actor')
    expect(state.writes.find((write) => write.path.startsWith('reservations/'))?.data).toMatchObject({ userId: 'resident', userName: 'Colono', userAddress: 'Olivo 22', createdByUid: 'actor', status: 'solicitada' })
  })

  it('rechaza por el límite del beneficiario sin crear', async () => {
    state.reservationCount = 2
    await expect(call({ auth: { uid: 'actor' }, data: input })).rejects.toThrow('max-reservations')
    expect(state.queriedOwner).toBe('resident')
    expect(state.writes.every((write) => !write.path.startsWith('reservations/'))).toBe(true)
  })

  it.each(['colono', 'tesorero'])('no permite suplantación desde %s', async (role) => {
    state.actorRole = role
    await expect(call({ auth: { uid: 'actor' }, data: input })).rejects.toThrow('admin-only')
    expect(state.writes.every((write) => !write.path.startsWith('reservations/'))).toBe(true)
  })

  it('rechaza un colono dado de baja antes de la transacción', async () => {
    state.residentStatus = 'rejected'
    await expect(call({ auth: { uid: 'actor' }, data: input })).rejects.toThrow('invalid-resident')
  })

  it('rechaza beneficiario eliminado', async () => {
    state.residentExists = false
    await expect(call({ auth: { uid: 'actor' }, data: input })).rejects.toThrow('resident-not-found')
  })

  it('conserva la reserva propia al omitir targetUserId', async () => {
    const { targetUserId: _target, ...ownInput } = input
    await call({ auth: { uid: 'actor' }, data: ownInput })
    expect(state.queriedOwner).toBe('actor')
    expect(state.writes.find((write) => write.path.startsWith('reservations/'))?.data).toMatchObject({ userId: 'actor', createdByUid: 'actor', userName: 'Admin' })
  })

  it('mantiene la detección de traslapes para reservas administrativas', async () => {
    state.overlap = true
    await expect(call({ auth: { uid: 'actor' }, data: input })).rejects.toThrow('slot-taken')
  })
})
