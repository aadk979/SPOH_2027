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
          /**
           * The integration suite truncates every table, so it must never point
           * at the database a developer has been working in. `SPOH_SKIP_DOTENV`
           * stops `config/env.ts` loading `server/.env` over the top of these,
           * and the whole environment is declared here instead - the same shape
           * CI uses, so a local failure reproduces there and vice versa.
           */
          env: {
            NODE_ENV: 'test',
            SPOH_SKIP_DOTENV: '1',
            DATABASE_URL:
              process.env.TEST_DATABASE_URL ??
              'postgresql://spoh:spoh@localhost:5435/spoh2027_test',
            AUTH_PROVIDER: 'local',
            LOCAL_AUTH_SECRET: 'test-only-secret-at-least-thirty-two-chars',
            CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
          },
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
