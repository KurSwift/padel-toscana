import { test, expect } from '@playwright/test'
import { loginWithPhone, logout } from './helpers'

test.use({ viewport: { width: 390, height: 844 } })

const runId = String(Date.now()).slice(-8)
const residentName = `Colono Administración ${runId}`
const phone = `57${runId}`
const firestoreUrl = 'http://127.0.0.1:8080/v1/projects/padel-toscana/databases/(default)/documents'

test('admin reserva para colono → autoría protegida → colono cancela y no puede suplantar', async ({ page, request }) => {
  test.setTimeout(90_000)
  await loginWithPhone(page, { street: 'Nogal', streetNumber: '1', tenDigitPhone: '5500000001' })
  await page.getByRole('link', { name: 'Configuración' }).click()
  await page.getByRole('button', { name: /^Usuarios/ }).click()
  await page.getByRole('button', { name: 'Agregar colono' }).click()
  await page.getByPlaceholder('Ej: María García').fill(residentName)
  await page.getByRole('button', { name: 'Olivo', exact: true }).click()
  await page.getByPlaceholder('Ej: 15').fill(runId)
  await page.getByPlaceholder('5512345678').fill(phone)
  await page.getByRole('button', { name: 'Crear', exact: true }).click()
  await expect(page.getByText(`${residentName} agregado.`)).toBeVisible()

  await page.getByRole('button', { name: 'Configuración', exact: true }).click()
  await page.getByRole('button', { name: /^Reservaciones/ }).click()
  await page.getByRole('button', { name: 'Reservar para un colono', exact: true }).click()
  await page.getByRole('searchbox').fill(runId)
  await page.getByRole('button', { name: new RegExp(residentName) }).click()
  await expect(page.getByRole('heading', { name: 'Disponibilidad' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver día siguiente' }).click()
  await page.getByRole('button', { name: 'Ver día siguiente' }).click()
  await expect(page.getByText('Cargando disponibilidad…', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: /Reservar \d/ }).first().click()
  await expect(page.getByRole('textbox', { name: 'Residente a cargo' })).toHaveValue(residentName)

  await page.screenshot({ path: test.info().outputPath('admin-booking-mobile.png') })

  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/createReservation'))
  await page.getByRole('button', { name: /^Confirmar/ }).click()
  const response = await responsePromise
  expect(response.ok()).toBeTruthy()
  const { result } = await response.json() as { result: { reservationId: string } }
  const creationRequest = response.request()
  const payload = creationRequest.postDataJSON() as { data: { targetUserId: string; courtId: string } }
  const headers = await creationRequest.allHeaders()
  const authorization = headers.authorization
  const read = await request.get(`${firestoreUrl}/reservations/${result.reservationId}`, { headers: { authorization } })
  expect(read.ok()).toBeTruthy()
  const { fields } = await read.json()
  expect(fields.userId.stringValue).toBe(payload.data.targetUserId)
  expect(fields.userName.stringValue).toBe(residentName)
  expect(fields.userAddress.stringValue).toContain(runId)
  expect(fields.createdByUid.stringValue).not.toBe(fields.userId.stringValue)
  expect(fields.status.stringValue).toBe('solicitada')

  // Ni siquiera admin puede modificar la autoría, ni crear directo en Firestore.
  const tamper = await request.patch(`${firestoreUrl}/reservations/${result.reservationId}?updateMask.fieldPaths=createdByUid`, {
    headers: { authorization }, data: { fields: { createdByUid: { stringValue: payload.data.targetUserId } } },
  })
  expect(tamper.status()).toBe(403)
  const directCreate = await request.post(`${firestoreUrl}/reservations`, { headers: { authorization }, data: { fields } })
  expect(directCreate.status()).toBe(403)

  await expect(page.getByText('¡Reservación creada!')).toBeVisible()
  await expect(page.getByText('El colono debe pagar', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Entendido' }).click()
  await logout(page)

  await loginWithPhone(page, { street: 'Olivo', streetNumber: runId, tenDigitPhone: phone })
  await page.getByRole('link', { name: 'Reservaciones' }).click()
  await expect(page.getByText('Pendiente de pago')).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar reservación' }).click()
  await expect(page.getByText('Reservación cancelada.')).toBeVisible()

  // Inyectar targetUserId desde el cliente de un colono no concede permisos.
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByRole('button', { name: 'Ver día siguiente' }).click()
  await page.getByRole('button', { name: 'Ver día siguiente' }).click()
  await expect(page.getByText('Cargando disponibilidad…', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: /Reservar \d/ }).first().click()
  await page.route('**/createReservation', async (route) => {
    const body = route.request().postDataJSON()
    await route.continue({ postData: JSON.stringify({ data: { ...body.data, targetUserId: payload.data.targetUserId } }) })
  })
  const rejectedPromise = page.waitForResponse((res) => res.url().endsWith('/createReservation'))
  await page.getByRole('button', { name: /^Confirmar/ }).click()
  const rejected = await rejectedPromise
  expect(rejected.status()).toBe(403)
  expect((await rejected.json()).error.message).toBe('admin-only')
  await expect(page.getByText('Solo administración puede reservar para un colono.')).toBeVisible()
})
