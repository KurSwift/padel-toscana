import { describe, it, expect } from 'vitest'
import { canActOnUser, canAssignRole, hasAllowedRole, normalizeGmail } from './userRules'

describe('canActOnUser', () => {
  it('permite actuar sobre otro usuario (cambiar rol o eliminar)', () => {
    expect(canActOnUser('admin-uid', 'other-uid')).toBe(true)
  })

  it('bloquea que un usuario actúe sobre sí mismo', () => {
    expect(canActOnUser('admin-uid', 'admin-uid')).toBe(false)
  })
})

describe('canAssignRole', () => {
  it('solo super-admin puede asignar roles', () => {
    expect(canAssignRole('super-admin')).toBe(true)
  })

  it('admin ya no puede asignar roles', () => {
    expect(canAssignRole('admin')).toBe(false)
  })

  it('tesorero y colono no pueden asignar roles', () => {
    expect(canAssignRole('tesorero')).toBe(false)
    expect(canAssignRole('colono')).toBe(false)
  })
})

describe('hasAllowedRole', () => {
  it('permite cualquier rol cuando no se especifica allowedRoles', () => {
    expect(hasAllowedRole('colono', undefined)).toBe(true)
    expect(hasAllowedRole(undefined, undefined)).toBe(true)
  })

  it('permite el rol cuando está en la lista', () => {
    expect(hasAllowedRole('admin', ['admin', 'tesorero'])).toBe(true)
  })

  it('bloquea el rol cuando no está en la lista', () => {
    expect(hasAllowedRole('colono', ['admin', 'tesorero'])).toBe(false)
  })

  it('bloquea cuando el rol es undefined pero se requiere uno específico', () => {
    expect(hasAllowedRole(undefined, ['admin'])).toBe(false)
  })
})

describe('normalizeGmail', () => {
  it('acepta un gmail y lo normaliza a minúsculas sin espacios', () => {
    expect(normalizeGmail('  Juan.Perez@Gmail.com ')).toBe('juan.perez@gmail.com')
  })

  it('rechaza otros dominios y correos mal formados', () => {
    expect(normalizeGmail('juan@empresa.com')).toBeNull()
    expect(normalizeGmail('@gmail.com')).toBeNull()
    expect(normalizeGmail('juan@gmail.com.mx')).toBeNull()
  })
})
