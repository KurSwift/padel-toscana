import { describe, expect, it } from 'vitest'
import { normalizeBulkMxPhone, validateBulkColono } from './bulkColonoRules'

describe('normalizeBulkMxPhone', () => {
  it('acepta teléfono local o con prefijo 52', () => {
    expect(normalizeBulkMxPhone('5512345678')).toBe('+525512345678')
    expect(normalizeBulkMxPhone('+52 5512345678')).toBe('+525512345678')
  })

  it('rechaza un teléfono incompleto', () => {
    expect(normalizeBulkMxPhone('551234')).toBeNull()
  })
})

describe('validateBulkColono', () => {
  it('normaliza una fila del formato documentado', () => {
    const result = validateBulkColono({ calle: 'nogal', numero_casa: 12, nombre_completo: ' María García ', telefono: '5512345678', email: '' })
    expect(result).toEqual({ ok: true, colono: {
      street: 'Nogal', streetNumber: '12', name: 'María García', phone: '+525512345678', email: null, addressKey: 'nogal 12',
    } })
  })

  it('rechaza las reglas de negocio básicas', () => {
    expect(validateBulkColono({ calle: 'Roble', numero_casa: 1, nombre_completo: 'Ana', telefono: '5512345678' }).ok).toBe(false)
    expect(validateBulkColono({ calle: 'Nogal', numero_casa: '', nombre_completo: 'Ana', telefono: '5512345678' }).ok).toBe(false)
    expect(validateBulkColono({ calle: 'Nogal', numero_casa: 1, nombre_completo: 'A', telefono: '5512345678' }).ok).toBe(false)
  })
})
