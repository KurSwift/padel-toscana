import { test, expect, type Page } from '@playwright/test'
import { loginWithPhone, logout } from './helpers'

// Mismo criterio que critical-flow.spec.ts: datos nuevos por corrida para
// no chocar con MAX_USERS_PER_ADDRESS ni con un gmail ya registrado.
const RUN_ID = String(Date.now()).slice(-8)
const ADMIN_PHONE = '5500000001' // Admin Seed — Nogal 1, ver SEED_USERS en scripts/seed.mjs.
// A: dado de alta ya con gmail. B: dado de alta sin correo (como los
// colonos que ya existen) y el admin le agrega el gmail después.
const COLONO_A = { name: 'Gabi Gmail E2E', number: `7${RUN_ID}`, phone: `56${RUN_ID}`, gmail: `gabi.${RUN_ID}@gmail.com` }
const COLONO_B = { name: 'Beto Gmail E2E', number: `8${RUN_ID}`, phone: `57${RUN_ID}`, gmail: `beto.${RUN_ID}@gmail.com` }

// "Continuar con Google" contra el emulador de Auth: abre su popup de
// cuentas de prueba (no hay Google real) y entra con el correo dado.
//
// OJO: el popup del emulador truena ("Internal assertion error: User ...
// does not have providerInfo google.com") en cuanto existe una cuenta a la
// que se le desvinculó Google (adminSetColonoEmail al cambiar el correo de
// alguien que ya había entrado con Google) — y se queda así hasta borrar
// todas las cuentas del emulador de Auth. Por eso este spec no cambia el
// correo de un colono ya vinculado; ese caso se verifica a mano.
async function continueWithGoogle(page: Page, email: string) {
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Continuar con Google' }).click()
  const popup = await popupPromise
  // Esperar el load: un clic antes de que el JS del popup se enganche no
  // abre el formulario y el fill se queda esperando un input oculto.
  await popup.waitForLoadState('load')
  const emailInput = popup.locator('#email-input')
  await expect(async () => {
    await popup.locator('#add-account-button').click()
    await expect(emailInput).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  await emailInput.fill(email)
  await popup.locator('#sign-in').click()
}

async function goToPhoneStep(page: Page, streetNumber: string) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Olivo', exact: true }).click()
  await page.getByPlaceholder('Ej: 15').fill(streetNumber)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
}

async function createColono(page: Page, colono: { name: string; number: string; phone: string }, gmail?: string) {
  await page.getByRole('button', { name: 'Agregar colono' }).click()
  await page.getByPlaceholder('Ej: María García').fill(colono.name)
  await page.getByRole('button', { name: 'Olivo', exact: true }).click()
  await page.getByPlaceholder('Ej: 15').fill(colono.number)
  await page.getByPlaceholder('5512345678').fill(colono.phone)
  if (gmail) await page.getByLabel('Correo de Gmail').fill(gmail)
  await page.getByRole('button', { name: 'Crear' }).click()
  await expect(page.getByText(`${colono.name} agregado.`)).toBeVisible()
}

test('colonos con gmail entran con Google y quedan vinculados a su cuenta', async ({ page }) => {
  // Siete logins en un solo flujo — no cabe en el timeout default de 30s.
  // Cada uno consulta getResidentsByAddress, limitado a 10 por IP cada 5
  // minutos (lookupRateLimits): dos corridas seguidas se topan con ese
  // límite y fallan en el paso de domicilio.
  test.setTimeout(120_000)

  // ── Alta de A con gmail; alta de B sin correo y se le agrega después ───
  await loginWithPhone(page, { street: 'Nogal', streetNumber: '1', tenDigitPhone: ADMIN_PHONE })
  await page.getByRole('link', { name: 'Configuración' }).click()
  await page.getByRole('button', { name: /^Usuarios/ }).click()
  await createColono(page, COLONO_A, COLONO_A.gmail)
  await createColono(page, COLONO_B)

  const rowB = page.locator('div.shadow-sm', { hasText: `Olivo ${COLONO_B.number}` })
  await rowB.getByRole('button', { name: 'Agregar correo de Gmail' }).click()
  await rowB.getByLabel(`Correo de Gmail de ${COLONO_B.name}`).fill('beto@empresa.com')
  await rowB.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('El correo debe ser una cuenta @gmail.com.')).toBeVisible()
  await rowB.getByLabel(`Correo de Gmail de ${COLONO_B.name}`).fill(COLONO_B.gmail)
  await rowB.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Correo guardado.')).toBeVisible()
  await expect(rowB.getByText(COLONO_B.gmail, { exact: false })).toBeVisible()
  await logout(page)

  // ── Un gmail que no es de ningún colono se rechaza ─────────────────────
  await goToPhoneStep(page, COLONO_A.number)
  await continueWithGoogle(page, `nadie.${RUN_ID}@gmail.com`)
  await expect(page.getByText('No encontramos un colono con ese correo de Gmail.', { exact: false })).toBeVisible()

  // ── A: primer login vincula, el segundo entra directo ──────────────────
  await goToPhoneStep(page, COLONO_A.number)
  await continueWithGoogle(page, COLONO_A.gmail)
  await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()
  await logout(page)

  await goToPhoneStep(page, COLONO_A.number)
  await continueWithGoogle(page, COLONO_A.gmail)
  await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()
  await logout(page)

  // El teléfono sigue entrando a la misma cuenta.
  await loginWithPhone(page, { street: 'Olivo', streetNumber: COLONO_A.number, tenDigitPhone: COLONO_A.phone })
  await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()
  await logout(page)

  // ── B: el gmail agregado por el admin funciona ─────────────────────────
  await goToPhoneStep(page, COLONO_B.number)
  await continueWithGoogle(page, COLONO_B.gmail)
  await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()
})
