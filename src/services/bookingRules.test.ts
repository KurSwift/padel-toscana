import { describe, expect, it } from 'vitest'
import { bookingPermissionError, canBookForResident, isBookingResident, isValidBookingTarget } from './bookingRules'

const resident = { role: 'colono', status: 'active' }

describe('reservaciones por administración', () => {
  it.each(['admin', 'super-admin'])('permite a %s activo reservar para un colono', (role) => {
    const actor = { role, status: 'active' }
    expect(canBookForResident(actor)).toBe(true)
    expect(bookingPermissionError(actor, 'resident-uid', resident)).toBeNull()
  })

  it.each(['colono', 'tesorero', undefined, 'unknown'])('rechaza un target explícito para rol %s', (role) => {
    const actor = { role, status: 'active' }
    expect(canBookForResident(actor)).toBe(false)
    expect(bookingPermissionError(actor, 'resident-uid', resident)).toBe('admin-only')
  })

  it.each(['pending', 'rejected', undefined])('rechaza al administrador con status %s', (status) => {
    const actor = { role: 'admin', status }
    expect(canBookForResident(actor)).toBe(false)
    expect(bookingPermissionError(actor, 'resident-uid', resident)).toBe('inactive-user')
  })

  it('rechaza perfiles inexistentes', () => {
    expect(bookingPermissionError(null, undefined, null)).toBe('user-not-found')
    expect(bookingPermissionError({ role: 'admin', status: 'active' }, 'missing', null)).toBe('resident-not-found')
  })

  it.each([
    { role: 'colono', status: 'pending' },
    { role: 'colono', status: 'rejected' },
    { role: 'colono' },
    { role: 'admin', status: 'active' },
    { role: 'super-admin', status: 'active' },
    { role: 'tesorero', status: 'active' },
  ])('excluye un beneficiario no elegible: %j', (target) => {
    expect(isBookingResident(target)).toBe(false)
    expect(bookingPermissionError({ role: 'admin', status: 'active' }, 'target', target)).toBe('invalid-resident')
  })

  it.each(['colono', 'admin', 'super-admin', 'tesorero'])('mantiene la reserva propia para %s activo sin target', (role) => {
    expect(bookingPermissionError({ role, status: 'active' }, undefined, null)).toBeNull()
  })

  it('solo ofrece colonos activos en el selector', () => {
    expect(isBookingResident(resident)).toBe(true)
    expect(isBookingResident(null)).toBe(false)
  })

  it.each([null, 42, {}, '', '  ', 'users/otro', '.', '..', 'a'.repeat(129)])('rechaza uid inválido %j', (value) => {
    expect(isValidBookingTarget(value)).toBe(false)
  })

  it.each([undefined, 'resident-uid'])('acepta target opcional %j', (value) => {
    expect(isValidBookingTarget(value)).toBe(true)
  })
})
