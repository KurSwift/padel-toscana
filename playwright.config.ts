import { defineConfig, devices } from '@playwright/test'

// E2E críticos contra los emuladores de Firebase (no CI, no producción).
// Precondiciones (ver AGENTS.md → "Emuladores, seeds y push-to-prod"):
//   cp .env.local.example .env.local   # una vez
//   npm run emulators                  # terminal 1
//   npm run seed                       # terminal 2 (idempotente)
//   npm run test:e2e                   # terminal 2 — levanta `npm run dev` solo si no hay uno ya corriendo en :5173
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
