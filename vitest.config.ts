import { defineConfig } from 'vitest/config'

/**
 * Bewust los van vite.config.ts: die laadt de PWA-plugin en de Tailwind-plugin,
 * en die hebben hier niets te doen. Deze tests raken geen DOM en geen netwerk --
 * het is de pure rekenlogica (geld, datums, saldi, standen), precies het deel
 * waar een fout stil doorwerkt in wat spelers te zien krijgen.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
