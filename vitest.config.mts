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
    // .kilo/** holds agent worktree copies of the repo — their stale test
    // snapshots must never run against this workspace's src via the '@' alias.
    exclude: ['**/node_modules/**', 'e2e/**', '.kilo/**'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
