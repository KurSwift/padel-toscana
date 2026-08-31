import { describe, it, expect } from 'vitest'
import { BRAND_TONES, DEFAULT_PALETTE_ID, getPalette, PALETTES } from './palettes'

const HEX_RE = /^#[0-9a-f]{6}$/i

describe('PALETTES', () => {
  it('tiene entre 6 y 8 paletas (decisión del issue: curadas, no un picker libre)', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(6)
    expect(PALETTES.length).toBeLessThanOrEqual(8)
  })

  it('cada paleta tiene los 9 tonos, todos hex válidos', () => {
    for (const palette of PALETTES) {
      for (const tone of BRAND_TONES) {
        expect(palette.tones[tone]).toMatch(HEX_RE)
      }
    }
  })

  it('los ids son únicos', () => {
    const ids = PALETTES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('la paleta default existe y es la primera (verde, sin cambio visual)', () => {
    expect(PALETTES[0].id).toBe(DEFAULT_PALETTE_ID)
    expect(PALETTES[0].tones[600]).toBe('#16a34a')
  })
})

describe('getPalette', () => {
  it('devuelve la paleta por id', () => {
    expect(getPalette('blue').id).toBe('blue')
  })

  it('cae a la primera paleta (default) si el id no existe', () => {
    expect(getPalette('inexistente').id).toBe(DEFAULT_PALETTE_ID)
  })
})
