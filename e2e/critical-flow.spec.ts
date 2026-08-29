import { test, expect } from '@playwright/test'
import { registerWithPhone, loginWithPhone, logout } from './helpers'

// Teléfono generado por corrida (no está en SEED_USERS de scripts/seed.mjs)
// para que el test se pueda repetir varias veces contra el mismo emulador
// sin volver a sembrar entre corridas. Además, arrancar de un usuario nuevo
// (0 reservaciones previas) evita que el test dependa de cuántas
// reservaciones de ejemplo tenga ya un usuario de seed — ese conteo crece
// cada vez que se corre `npm run seed` (las reservaciones de ejemplo se
// agregan con `.add()`, no son idempotentes como users/courts) y podría
// hacer que la reservación nueva choque con `maxActiveReservationsPerUser`.
// Mismo motivo para el número: reusar una dirección fija ("Olivos 77")
// entre corridas la satura contra MAX_USERS_PER_ADDRESS (2) al segundo run.
const RUN_ID = String(Date.now()).slice(-8)
const NEW_USER_PHONE = `55${RUN_ID}`
const NEW_USER_STREET_NUMBER = RUN_ID
const NEW_USER_NAME = 'Diego Nuevo E2E'
const TESORERO_PHONE = '5500000005' // Tere Tesorera — ver SEED_USERS en scripts/seed.mjs.

test('registro → aprobación → reserva → pago → cancelación', async ({ page }) => {
  // ── Registro ──────────────────────────────────────────────────────────
  await registerWithPhone(page, {
    street: 'Olivos',
    streetNumber: NEW_USER_STREET_NUMBER,
    tenDigitPhone: NEW_USER_PHONE,
    name: NEW_USER_NAME,
  })

  // Perfil creado en status 'pending' — ProtectedRoute bloquea con esta pantalla.
  await expect(page.getByText('Solicitud en revisión')).toBeVisible()
  await expect(page.getByText(NEW_USER_NAME)).toBeVisible()
  await logout(page)

  // ── Aprobación ────────────────────────────────────────────────────────
  await loginWithPhone(page, '5500000001') // Admin Seed
  await page.getByRole('button', { name: 'Admin' }).click()
  await page.getByRole('button', { name: /^Usuarios/ }).click()

  const pendingCard = page.locator('div', { hasText: NEW_USER_NAME }).filter({
    has: page.getByRole('button', { name: 'Aprobar' }),
  }).last()
  await pendingCard.getByRole('button', { name: 'Aprobar' }).click()
  await expect(page.getByText(`${NEW_USER_NAME} aprobado.`)).toBeVisible()
  await logout(page)

  // ── Reserva ───────────────────────────────────────────────────────────
  await loginWithPhone(page, NEW_USER_PHONE)
  await expect(page.getByText(`Hola, ${NEW_USER_NAME}`)).toBeVisible()

  // Pasado mañana: la cancha requiere minLeadHours=24 — "mañana" puede
  // quedar por debajo de eso según la hora del día en que corra el test.
  await page.getByRole('button', { name: '›' }).click()
  await page.getByRole('button', { name: '›' }).click()

  await page.getByRole('button', { name: /Reservar/ }).first().click()

  // BookingSheet: nombre del residente ya viene precargado con el perfil.
  await page.getByRole('button', { name: /^Confirmar/ }).click()
  await expect(page.getByText('¡Reservación creada!')).toBeVisible()
  await page.getByRole('button', { name: 'Entendido' }).click()

  await page.getByRole('button', { name: 'Mis reservaciones' }).click()
  // Es la única reservación de este usuario (recién registrado) — el botón
  // "Cancelar" alcanza para identificarla sin ambigüedad. No usamos el
  // texto del horario reservado porque en MyReservations el status vive en
  // un <div> interno que también matchearía por texto, resolviendo al
  // wrapper interno en vez de a la tarjeta completa (la que trae el botón).
  const reservationCard = page.locator('div').filter({
    has: page.getByRole('button', { name: 'Cancelar' }),
  }).last()
  await expect(reservationCard.getByText('Pendiente de pago')).toBeVisible()

  await logout(page)

  // ── Pago ──────────────────────────────────────────────────────────────
  await loginWithPhone(page, TESORERO_PHONE)
  await page.getByRole('button', { name: 'Pagos' }).click()
  const pendingPaymentCard = page.locator('div', { hasText: NEW_USER_NAME }).filter({
    has: page.getByRole('button', { name: 'Confirmar pago' }),
  }).last()
  await pendingPaymentCard.getByRole('button', { name: 'Confirmar pago' }).click()
  await expect(page.getByText(`Pago de ${NEW_USER_NAME.split(' ')[0]} confirmado.`)).toBeVisible()
  await logout(page)

  // ── Cancelación ───────────────────────────────────────────────────────
  await loginWithPhone(page, NEW_USER_PHONE)
  await page.getByRole('button', { name: 'Mis reservaciones' }).click()
  const confirmedCard = page.locator('div').filter({
    has: page.getByRole('button', { name: 'Cancelar' }),
  }).last()
  await expect(confirmedCard.getByText('Confirmada')).toBeVisible()
  await confirmedCard.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByText('Reservación cancelada.')).toBeVisible()
})
