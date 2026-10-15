import { describe, it, expect } from 'vitest'
import {
  isValidStreet,
  isAddressAvailable,
  normalizeAddress,
  isValidColonoName,
  isValidMxPhone,
  normalizeGmail,
  googleLinkEmail,
  pickGoogleLinkTarget,
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

describe('normalizeGmail', () => {
  it('acepta un gmail y lo normaliza a minúsculas sin espacios', () => {
    expect(normalizeGmail('  Juan.Perez@Gmail.com ')).toBe('juan.perez@gmail.com')
  })

  it('rechaza otros dominios, incluso de Google Workspace', () => {
    expect(normalizeGmail('juan@empresa.com')).toBeNull()
    expect(normalizeGmail('juan@googlemail.com')).toBeNull()
  })

  it('rechaza correos mal formados', () => {
    expect(normalizeGmail('')).toBeNull()
    expect(normalizeGmail('@gmail.com')).toBeNull()
    expect(normalizeGmail('juan perez@gmail.com')).toBeNull()
    expect(normalizeGmail('juan@gmail.com.mx')).toBeNull()
  })
})

describe('googleLinkEmail', () => {
  const token = { email: 'Juan@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }

  it('devuelve el gmail normalizado de un login de Google verificado', () => {
    expect(googleLinkEmail(token)).toBe('juan@gmail.com')
  })

  it('rechaza un login que no es de Google', () => {
    expect(googleLinkEmail({ ...token, firebase: { sign_in_provider: 'phone' } })).toBeNull()
  })

  it('rechaza un correo no verificado', () => {
    expect(googleLinkEmail({ ...token, email_verified: false })).toBeNull()
  })

  it('rechaza una cuenta de Google que no es gmail', () => {
    expect(googleLinkEmail({ ...token, email: 'juan@empresa.com' })).toBeNull()
  })

  it('rechaza un token sin correo', () => {
    expect(googleLinkEmail({ ...token, email: undefined })).toBeNull()
  })
})

describe('pickGoogleLinkTarget', () => {
  it('elige al único colono activo con ese correo', () => {
    expect(pickGoogleLinkTarget([{ uid: 'a', status: 'active' }])).toEqual({ ok: true, uid: 'a' })
  })

  it('trata un perfil sin status como activo (usuarios antiguos)', () => {
    expect(pickGoogleLinkTarget([{ uid: 'a' }])).toEqual({ ok: true, uid: 'a' })
  })

  it('ignora perfiles pendientes o rechazados', () => {
    expect(pickGoogleLinkTarget([{ uid: 'a', status: 'pending' }, { uid: 'b', status: 'rejected' }]))
      .toEqual({ ok: false, code: 'gmail-not-found' })
  })

  it('rechaza si nadie tiene ese correo', () => {
    expect(pickGoogleLinkTarget([])).toEqual({ ok: false, code: 'gmail-not-found' })
  })

  it('rechaza si dos colonos activos comparten el correo', () => {
    expect(pickGoogleLinkTarget([{ uid: 'a' }, { uid: 'b', status: 'active' }]))
      .toEqual({ ok: false, code: 'gmail-ambiguous' })
  })
})
