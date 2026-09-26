import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    fileParallelism: false,
    // e2e/ holds Playwright specs (run by `npm run qa:e2e`), not vitest tests.
    exclude: ['**/node_modules/**', 'e2e/**'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
