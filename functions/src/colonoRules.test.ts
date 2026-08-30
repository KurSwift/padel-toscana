import { describe, it, expect } from 'vitest'
import {
  isValidStreet,
  isAddressAvailable,
  normalizeAddress,
  isValidColonoName,
  isValidMxPhone,
} from './colonoRules'

describe('isValidStreet', () => {
  it('acepta las tres calles válidas', () => {
    expect(isValidStreet('Nogal')).toBe(true)
    expect(isValidStreet('Olivo')).toBe(true)
    expect(isValidStreet('Encino')).toBe(true)
  })

  it('rechaza una calle que no existe', () => {
    expect(isValidStreet('Roble')).toBe(false)
  })

  it('es sensible a mayúsculas/minúsculas', () => {
    expect(isValidStreet('nogal')).toBe(false)
  })

  it('rechaza string vacío', () => {
    expect(isValidStreet('')).toBe(false)
  })
})

describe('isAddressAvailable', () => {
  it('permite con 0 uids', () => {
    expect(isAddressAvailable([])).toBe(true)
  })

  it('permite con 1 uid', () => {
    expect(isAddressAvailable(['uid-1'])).toBe(true)
  })

  it('bloquea con 2 uids (tope)', () => {
    expect(isAddressAvailable(['uid-1', 'uid-2'])).toBe(false)
  })
})

describe('normalizeAddress', () => {
  it('concatena calle y número en minúsculas', () => {
    expect(normalizeAddress('Nogal', '35')).toBe('nogal 35')
  })

  it('quita espacios al inicio/final del número', () => {
    expect(normalizeAddress('Olivo', '  12  ')).toBe('olivo 12')
  })

  it('produce la misma llave sin importar mayúsculas en la calle', () => {
    expect(normalizeAddress('ENCINO', '8')).toBe('encino 8')
  })
})

describe('isValidColonoName', () => {
  it('rechaza vacío', () => {
    expect(isValidColonoName('')).toBe(false)
  })

  it('rechaza un solo caracter', () => {
    expect(isValidColonoName('A')).toBe(false)
  })

  it('rechaza solo espacios', () => {
    expect(isValidColonoName('   ')).toBe(false)
  })

  it('acepta 2 o más caracteres', () => {
    expect(isValidColonoName('Ana')).toBe(true)
  })
})

describe('isValidMxPhone', () => {
  it('acepta +52 seguido de 10 dígitos', () => {
    expect(isValidMxPhone('+525512345678')).toBe(true)
  })

  it('rechaza sin +52', () => {
    expect(isValidMxPhone('5512345678')).toBe(false)
  })

  it('rechaza con menos de 10 dígitos', () => {
    expect(isValidMxPhone('+5255123456')).toBe(false)
  })

  it('rechaza con más de 10 dígitos', () => {
    expect(isValidMxPhone('+52551234567890')).toBe(false)
  })

  it('rechaza caracteres no numéricos', () => {
    expect(isValidMxPhone('+525512345abc')).toBe(false)
  })
})
