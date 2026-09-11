import { describe, expect, it } from 'vitest'
import { parseBulkColonosJson } from './bulkColonoRules'

describe('parseBulkColonosJson', () => {
  it('acepta el formato de preregistro de colonos', () => {
    const result = parseBulkColonosJson(JSON.stringify({
      colonos: [{ calle: 'Nogal', numero_casa: 12, nombre_completo: 'María García', telefono: '5512345678', email: '' }],
    }))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.colonos).toHaveLength(1)
  })

  it('rechaza JSON inválido, sin colonos o con filas que no son objetos', () => {
    expect(parseBulkColonosJson('{').ok).toBe(false)
    expect(parseBulkColonosJson(JSON.stringify({ colonos: [] })).ok).toBe(false)
    expect(parseBulkColonosJson(JSON.stringify({ colonos: ['María'] })).ok).toBe(false)
  })
})
