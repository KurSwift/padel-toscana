import { type Page, expect } from '@playwright/test'

const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'
const PROJECT_ID = 'padel-toscana'

// El emulador de Auth expone las OTP que genera (nunca envía SMS real) en
// este endpoint de testing — no existe equivalente en producción. Es la
// forma soportada de automatizar el login por teléfono contra el emulador.
async function fetchOtpCode(fullPhoneNumber: string): Promise<string> {
  const res = await fetch(
    `${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/verificationCodes`,
  )
  const { verificationCodes } = (await res.json()) as {
    verificationCodes: { phoneNumber: string; code: string }[]
  }
  const match = [...verificationCodes].reverse().find((v) => v.phoneNumber === fullPhoneNumber)
  if (!match) throw new Error(`No se encontró código OTP para ${fullPhoneNumber} — ¿está corriendo el emulador de Auth?`)
  return match.code
}

// Flujo de login por teléfono en /login (modo "Ya tengo cuenta"), leyendo
// el código OTP directo del emulador de Auth en vez de una SMS real. El
// RecaptchaVerifier invisible de LoginPage no bloquea esto: el SDK de
// Firebase lo omite automáticamente cuando detecta que Auth está
// conectado al emulador (connectAuthEmulator en src/firebase.ts).
export async function loginWithPhone(page: Page, tenDigitPhone: string) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Ya tengo cuenta' }).click()
  await page.getByPlaceholder('5512345678').fill(tenDigitPhone)
  await page.getByRole('button', { name: 'Enviar código' }).click()

  // exact: true es necesario — el placeholder del teléfono ("5512345678")
  // contiene "123456" como substring, y getByPlaceholder matchea por
  // substring por default.
  const otpInput = page.getByPlaceholder('123456', { exact: true })
  await expect(otpInput).toBeVisible()
  const code = await fetchOtpCode(`+52${tenDigitPhone}`)
  await otpInput.fill(code)
  await page.getByRole('button', { name: 'Verificar' }).click()
}

// Registro completo (modo "Registrarme"): domicilio → teléfono/OTP → nombre.
// Deja al usuario autenticado con perfil en status 'pending' (ver
// registerUser en src/services/users.ts) — necesita aprobación de un admin
// antes de poder usar la app.
export async function registerWithPhone(
  page: Page,
  params: { street: 'Nogal' | 'Olivos' | 'Encino'; streetNumber: string; tenDigitPhone: string; name: string },
) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Registrarme' }).click()
  await page.getByRole('button', { name: params.street, exact: true }).click()
  await page.getByPlaceholder('Ej: 15').fill(params.streetNumber)
  await page.getByRole('button', { name: 'Continuar' }).click()

  await page.getByPlaceholder('5512345678').fill(params.tenDigitPhone)
  await page.getByRole('button', { name: 'Enviar código' }).click()

  // exact: true es necesario — el placeholder del teléfono ("5512345678")
  // contiene "123456" como substring, y getByPlaceholder matchea por
  // substring por default.
  const otpInput = page.getByPlaceholder('123456', { exact: true })
  await expect(otpInput).toBeVisible()
  const code = await fetchOtpCode(`+52${params.tenDigitPhone}`)
  await otpInput.fill(code)
  await page.getByRole('button', { name: 'Verificar' }).click()

  await expect(page).toHaveURL(/\/registro/)
  await page.getByPlaceholder('Ej: María García').fill(params.name)
  await page.getByRole('button', { name: 'Entrar a Padel Toscana' }).click()
}

// Cierra sesión desde cualquier página protegida (home, admin, tesorero,
// pantalla de "solicitud en revisión") para dejar el navegador listo para
// loguear a otro usuario de seed dentro del mismo test. Espera a llegar a
// /login antes de devolver el control — signOut() es async y un
// page.goto('/login') inmediato después de clickear "Salir" puede abortar
// esa llamada a medio camino (la sesión de Firebase Auth persistida en
// IndexedDB no llega a limpiarse, y el siguiente loginWithPhone() se
// encuentra con la sesión anterior todavía activa).
export async function logout(page: Page) {
  const homeSignOut = page.getByRole('button', { name: 'Salir' })
  if (await homeSignOut.isVisible().catch(() => false)) {
    await homeSignOut.click()
  } else if (await page.getByRole('button', { name: 'Cerrar sesión' }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  } else {
    // Admin/Tesorero no tienen botón de "Salir" propio — hay que volver a home primero.
    await page.getByRole('button', { name: '← Volver' }).click()
    await page.getByRole('button', { name: 'Salir' }).click()
  }
  await page.waitForURL(/\/login/)
}
