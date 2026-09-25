import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // happy-dom rather than jsdom: the outbox needs IndexedDB and the capture
    // hooks need `navigator`, and it starts an order of magnitude faster.
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    // Measured, not gated: the client starts far below the server's
    // thresholds, and a gate nobody can pass gets ignored rather than met.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text-summary', 'lcov'],
    },
  },
});
