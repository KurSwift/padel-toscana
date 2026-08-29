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
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
