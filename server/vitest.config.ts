import { defineConfig } from 'vitest/config';

/**
 * Two projects, because they have different prerequisites.
 *
 * `unit` needs nothing and runs on every save. `integration` needs a live
 * Postgres and drives the real Express app through Supertest — it is the only
 * place authorization is actually proven, so it runs in CI on every PR.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup.ts'],
          // Silences the logger and lets the truncation guard in
          // tests/helpers/db.ts recognise this as a test run.
          env: { NODE_ENV: 'test' },
          // Integration tests share one database. Running files in parallel
          // would let one suite's truncation delete another's fixtures.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts', 'src/middleware/**/*.ts'],
      exclude: ['src/generated/**', '**/*.test.ts', 'src/modules/**/router.ts'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
      reporter: ['text', 'lcov'],
    },
  },
});
