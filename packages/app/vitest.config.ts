import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts, whose root is src/renderer and which loads the
// Electron plugins: tests cover both src/main and src/renderer.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
