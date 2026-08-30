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

// Flujo de login por teléfono en /login: domicilio (saludo por nombre) →
// teléfono → OTP, leyendo el código directo del emulador de Auth en vez de
// una SMS real. El RecaptchaVerifier invisible de LoginPage no bloquea
// esto: el SDK de Firebase lo omite automáticamente cuando detecta que Auth
// está conectado al emulador (connectAuthEmulator en src/firebase.ts).
// Requiere que ya exista un colono activo en ese domicilio (dado de alta
// por un admin — ver adminCreateColono en functions/src/index.ts) o
// getResidentsByAddress no encuentra a nadie y LoginPage no deja avanzar.
export async function loginWithPhone(
  page: Page,
  params: { street: 'Nogal' | 'Olivo' | 'Encino'; streetNumber: string; tenDigitPhone: string },
) {
  await page.goto('/login')
  await page.getByRole('button', { name: params.street, exact: true }).click()
  await page.getByPlaceholder('Ej: 15').fill(params.streetNumber)
  await page.getByRole('button', { name: 'Continuar' }).click()

  const phoneInput = page.getByPlaceholder('5512345678')
  await expect(phoneInput).toBeVisible()
  await phoneInput.fill(params.tenDigitPhone)
  await page.getByRole('button', { name: 'Enviar código' }).click()

  // exact: true es necesario — el placeholder del teléfono ("5512345678")
  // contiene "123456" como substring, y getByPlaceholder matchea por
  // substring por default.
  const otpInput = page.getByPlaceholder('123456', { exact: true })
  await expect(otpInput).toBeVisible()
  const code = await fetchOtpCode(`+52${params.tenDigitPhone}`)
  await otpInput.fill(code)
  await page.getByRole('button', { name: 'Verificar' }).click()
}

// NOTA: existía un helper `registerWithPhone` que automatizaba el
// auto-registro (modo "Registrarme" en /login, ya sin punto de entrada en
// la UI — ver TASKS.md). RegisterPage.tsx/registerUser() siguen intactos y
// funcionales, pero automatizar ese flujo ahora requeriría autenticar en el
// emulador sin pasar por /login (la UI que lo disparaba desapareció), lo
// cual implica exponer el objeto `auth` del cliente para pruebas o mintear
// un custom token con el Admin SDK — suficiente complejidad/fragilidad para
// una ruta que ya no es parte del flujo normal de la app que no vale la
// pena mantenerla cubierta por e2e por ahora. Si se reactiva el
// auto-registro como entrada real, vale la pena reconstruir este helper.

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
