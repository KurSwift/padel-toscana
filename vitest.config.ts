import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/setupTests.ts'],
    // e2e/ son specs de Playwright (npm run test:e2e), no de Vitest — su
    // test() choca con el de Vitest si Vitest intenta recogerlos también.
    // functions/ tiene su propio vitest.config.mts + tsconfig (CommonJS,
    // sin los path aliases de la app) — se corre aparte con
    // `npm run test:functions`, no como parte de este config.
    exclude: [...configDefaults.exclude, 'e2e/**', 'functions/**'],
  },
})
