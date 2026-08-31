import { describe, it, expect } from 'vitest'
import { isValidSiteName, isValidWhatsappUrl, MAX_SITE_NAME_LENGTH } from './siteSettingsRules'

describe('isValidSiteName', () => {
  it('acepta un nombre normal', () => {
    expect(isValidSiteName('Padel Toscana')).toBe(true)
  })

  it('rechaza vacío o solo espacios', () => {
    expect(isValidSiteName('')).toBe(false)
    expect(isValidSiteName('   ')).toBe(false)
  })

  it('acepta justo en el límite de longitud', () => {
    expect(isValidSiteName('a'.repeat(MAX_SITE_NAME_LENGTH))).toBe(true)
  })

  it('rechaza un nombre más largo que el límite', () => {
    expect(isValidSiteName('a'.repeat(MAX_SITE_NAME_LENGTH + 1))).toBe(false)
  })
})

describe('isValidWhatsappUrl', () => {
  it('acepta vacío (link opcional)', () => {
    expect(isValidWhatsappUrl('')).toBe(true)
    expect(isValidWhatsappUrl('   ')).toBe(true)
  })

  it('acepta links wa.me y chat.whatsapp.com', () => {
    expect(isValidWhatsappUrl('https://wa.me/5215500000000')).toBe(true)
    expect(isValidWhatsappUrl('https://chat.whatsapp.com/AbCdEf123')).toBe(true)
  })

  it('rechaza URLs que no son de WhatsApp', () => {
    expect(isValidWhatsappUrl('https://example.com')).toBe(false)
  })

  it('rechaza http (no https) aunque sea dominio válido', () => {
    expect(isValidWhatsappUrl('http://wa.me/5215500000000')).toBe(false)
  })
})
