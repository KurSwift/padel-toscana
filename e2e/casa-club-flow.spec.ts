import { test, expect, type Page } from '@playwright/test'
import { loginWithPhone, logout } from './helpers'

// Mismo patrón de RUN_ID que critical-flow.spec.ts (ver comentario ahí) —
// usuario y domicilio nuevos por corrida para que el test se pueda repetir
// contra el mismo emulador sin sembrar de nuevo. Prefijo "56" (vs "55" en
// critical-flow.spec.ts) para no colisionar si ambos specs corren en el
// mismo milisegundo.
const RUN_ID = String(Date.now()).slice(-8)
const NEW_USER_PHONE = `56${RUN_ID}`
const NEW_USER_STREET_NUMBER = RUN_ID
const NEW_USER_NAME = 'Elena Club E2E'
const ADMIN_PHONE = '5500000001' // Admin Seed — Nogal 1, ver SEED_USERS en scripts/seed.mjs.
const TESORERO_PHONE = '5500000005' // Tere Tesorera — Encino 8.

// Casa club: minLeadHours=72 y daysAheadAllowed=90 (ver
// DEFAULT_COURT_SETTINGS_BY_TYPE en src/services/courts.ts). +5/+7 días dan
// margen de sobra sobre las 72h mínimas sin importar la hora del día en que
// corra el test (mismo criterio que el +2 días de critical-flow.spec.ts
// para las 24h de cancha).
const FIRST_BOOKING_DAYS_AHEAD = 5
const SECOND_BOOKING_DAYS_AHEAD = 7

async function goToCasaClub(page: Page) {
  await page.getByRole('button', { name: '🏠 Casa Club' }).click()
}

async function advanceDate(page: Page, days: number) {
  for (let i = 0; i < days; i++) {
    await page.getByRole('button', { name: '›' }).click()
  }
}

test('reserva casa club: depósito, pago, devolución de depósito y cancelación', async ({ page }) => {
  // ── Alta de colono (admin) ───────────────────────────────────────────────
  await loginWithPhone(page, { street: 'Nogal', streetNumber: '1', tenDigitPhone: ADMIN_PHONE })
  await page.getByRole('button', { name: 'Admin' }).click()
  await page.getByRole('button', { name: /^Usuarios/ }).click()
  await page.getByRole('button', { name: '+ Agregar colono' }).click()
  await page.getByPlaceholder('Ej: María García').fill(NEW_USER_NAME)
  await page.getByRole('button', { name: 'Olivo', exact: true }).click()
  await page.getByPlaceholder('Ej: 15').fill(NEW_USER_STREET_NUMBER)
  await page.getByPlaceholder('5512345678').fill(NEW_USER_PHONE)
  await page.getByRole('button', { name: 'Crear' }).click()
  await expect(page.getByText(`${NEW_USER_NAME} agregado.`)).toBeVisible()
  await logout(page)

  // ── Reserva A: depósito al confirmar ─────────────────────────────────────
  await loginWithPhone(page, { street: 'Olivo', streetNumber: NEW_USER_STREET_NUMBER, tenDigitPhone: NEW_USER_PHONE })
  await goToCasaClub(page)
  await advanceDate(page, FIRST_BOOKING_DAYS_AHEAD)

  await page.getByRole('button', { name: /Casa Club disponible/ }).click()
  await expect(page.getByText(/Depósito de/)).toBeVisible()
  await expect(page.getByText(/reembolsables después del evento/)).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar reservación' }).click()
  await expect(page.getByText('¡Reservación creada!')).toBeVisible()
  await expect(page.getByText(/se te devuelve después del evento/)).toBeVisible()
  await page.getByRole('button', { name: 'Entendido' }).click()

  await page.getByRole('button', { name: 'Mis reservaciones' }).click()
  await expect(page.getByText('Pendiente de pago')).toBeVisible()
  await logout(page)

  // ── Pago (tesorero) ───────────────────────────────────────────────────────
  await loginWithPhone(page, { street: 'Encino', streetNumber: '8', tenDigitPhone: TESORERO_PHONE })
  await page.getByRole('button', { name: 'Pagos' }).click()
  const pendingPaymentCard = page.locator('div', { hasText: NEW_USER_NAME }).filter({
    has: page.getByRole('button', { name: 'Confirmar pago' }),
  }).last()
  await pendingPaymentCard.getByRole('button', { name: 'Confirmar pago' }).click()
  await expect(page.getByText(`Pago de ${NEW_USER_NAME.split(' ')[0]} confirmado.`)).toBeVisible()
  await logout(page)

  // ── Forzar 'finalizada' (admin) ──────────────────────────────────────────
  // El panel de admin (ReservationsTab) permite forzar cualquier transición
  // de status (ver comentario "Override manual de admin" en
  // src/services/reservations.ts) — se usa aquí para llevar la reservación
  // a 'finalizada' sin tener que esperar a que pase la fecha real del
  // evento. ReservationsTab solo muestra el primer nombre (r.userName.split(
  // ' ')[0]), a diferencia de TesoreroPage más abajo, que usa
  // residentInChargeName completo.
  await loginWithPhone(page, { street: 'Nogal', streetNumber: '1', tenDigitPhone: ADMIN_PHONE })
  await page.getByRole('button', { name: 'Admin' }).click()
  await advanceDate(page, FIRST_BOOKING_DAYS_AHEAD)
  const reservationRow = page.locator('div', { hasText: NEW_USER_NAME.split(' ')[0] }).filter({
    has: page.locator('select'),
  }).last()
  await reservationRow.locator('select').selectOption('finalizada')
  await expect(page.getByText(`actualizada a "Finalizada".`)).toBeVisible()
  await logout(page)

  // ── Devolución del depósito (tesorero) ───────────────────────────────────
  await loginWithPhone(page, { street: 'Encino', streetNumber: '8', tenDigitPhone: TESORERO_PHONE })
  await page.getByRole('button', { name: 'Pagos' }).click()
  const depositCard = page.locator('div', { hasText: NEW_USER_NAME }).filter({
    has: page.getByRole('button', { name: /Devolver depósito/ }),
  }).last()
  await depositCard.getByRole('button', { name: /Devolver depósito/ }).click()
  await expect(page.getByText(`Depósito de ${NEW_USER_NAME.split(' ')[0]} devuelto.`)).toBeVisible()
  await logout(page)

  // ── Reserva B: cancelación dentro del plazo de 48h ───────────────────────
  // Nota: no se verifica "Depósito devuelto" en "Mis reservaciones" del
  // colono — subscribeToUserReservations() solo trae reservaciones en
  // OCCUPYING_STATUSES ('solicitada'/'pagada'); una vez en
  // 'deposito-devuelto' deja de listarse ahí por diseño (esa vista es solo
  // "reservaciones activas"). El toast de arriba ya confirma la devolución.
  await loginWithPhone(page, { street: 'Olivo', streetNumber: NEW_USER_STREET_NUMBER, tenDigitPhone: NEW_USER_PHONE })
  await goToCasaClub(page)
  await advanceDate(page, SECOND_BOOKING_DAYS_AHEAD)
  await page.getByRole('button', { name: /Casa Club disponible/ }).click()
  await page.getByRole('button', { name: 'Confirmar reservación' }).click()
  await expect(page.getByText('¡Reservación creada!')).toBeVisible()
  await page.getByRole('button', { name: 'Entendido' }).click()

  await page.getByRole('button', { name: 'Mis reservaciones' }).click()
  // .last() basta para identificarla sin ambigüedad: es la de fecha más
  // reciente entre las dos de este usuario (MyReservations ordena por
  // fecha ascendente) — mismo criterio que critical-flow.spec.ts, salvo que
  // ahí la reservación de deposito-devuelto también trae botón "Cancelar"
  // (MyReservations no lo oculta por status), por eso depende del orden.
  const reservationCardB = page.locator('div').filter({
    has: page.getByRole('button', { name: 'Cancelar' }),
  }).last()
  await expect(reservationCardB.getByText('Pendiente de pago')).toBeVisible()
  await reservationCardB.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByText('Reservación cancelada.')).toBeVisible()
})
