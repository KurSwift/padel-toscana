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
  // Default de Playwright (5s) — el primer expect() de cada test espera a
  // que loginWithPhone() pase de domicilio a teléfono, lo que depende de
  // getResidentsByAddress() y del intercambio del debug token de App Check
  // contra la red real (firebaseappcheck.googleapis.com, sin bypass de
  // emulador para eso) en un contexto de navegador nuevo — ver AGENTS.md.
  // 5s a veces no basta para ese round-trip y producía falsos negativos
  // intermitentes sin relación con el código bajo prueba.
  expect: { timeout: 15_000 },
  use: {
    // 127.0.0.1 evita que algunos entornos resuelvan localhost a ::1 mientras
    // Vite escucha en IPv4; los emuladores ya usan explícitamente IPv4.
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    // --host 127.0.0.1: `npm run dev` a secas enlaza solo en IPv6 en algunas
    // máquinas (Node/Vite eligen ::1 sobre 0.0.0.0 por default); baseURL/url
    // usan 127.0.0.1 explícito, así que sin esto el healthcheck de abajo
    // nunca conecta y el arranque agota el timeout aunque Vite sí esté listo.
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
