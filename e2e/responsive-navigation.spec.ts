import { test, expect } from '@playwright/test'
import { loginWithPhone, logout } from './helpers'

const ADMIN_PHONE = '5500000001'

test('cambia entre tab bar móvil y sidebar de tableta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await loginWithPhone(page, { street: 'Nogal', streetNumber: '1', tenDigitPhone: ADMIN_PHONE })

  await expect(page.locator('nav.fixed')).toBeVisible()
  await expect(page.locator('aside')).toBeHidden()
  await expect(page.getByRole('link', { name: 'Calendario' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Configuración' })).toBeVisible()

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(page.locator('aside')).toBeVisible()
  await expect(page.locator('nav.fixed')).toBeHidden()
  await expect(page.getByRole('link', { name: 'Pagos' })).toBeVisible()

  await logout(page)
})
