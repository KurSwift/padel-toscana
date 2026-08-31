import { describe, it, expect } from 'vitest'
import { isValidLogoFile, MAX_LOGO_SIZE_BYTES } from './brandingRules'

describe('isValidLogoFile', () => {
  it('acepta PNG, JPEG y SVG dentro del límite de tamaño', () => {
    expect(isValidLogoFile({ type: 'image/png', size: 1024 })).toBe(true)
    expect(isValidLogoFile({ type: 'image/jpeg', size: 1024 })).toBe(true)
    expect(isValidLogoFile({ type: 'image/svg+xml', size: 1024 })).toBe(true)
  })

  it('rechaza tipos de archivo no permitidos', () => {
    expect(isValidLogoFile({ type: 'application/pdf', size: 1024 })).toBe(false)
    expect(isValidLogoFile({ type: 'image/gif', size: 1024 })).toBe(false)
  })

  it('rechaza un archivo vacío', () => {
    expect(isValidLogoFile({ type: 'image/png', size: 0 })).toBe(false)
  })

  it('acepta justo en el límite de tamaño', () => {
    expect(isValidLogoFile({ type: 'image/png', size: MAX_LOGO_SIZE_BYTES })).toBe(true)
  })

  it('rechaza un archivo más grande que el límite', () => {
    expect(isValidLogoFile({ type: 'image/png', size: MAX_LOGO_SIZE_BYTES + 1 })).toBe(false)
  })
})
