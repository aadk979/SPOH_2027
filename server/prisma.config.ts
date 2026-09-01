import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * The connection URL lives here rather than in `schema.prisma` (Prisma 7 removed
 * `datasource.url`). This file is read by the Prisma CLI only — Migrate, Studio
 * and `db seed`. The application runtime never loads it; the server builds its
 * own pooled adapter in `src/lib/prisma.ts` from the zod-validated env.
 *
 * `DATABASE_URL` is deliberately read raw here instead of through
 * `src/config/env.ts`, because the CLI must work in contexts where the full
 * server env (Cognito, CORS, rate limits) is neither present nor relevant.
 */
// Prisma 7 no longer loads `.env` implicitly, and this file is self-contained
// on purpose — importing the server's env module would drag Cognito and CORS
// validation into a CLI that only needs a connection string.
if (!process.env.DATABASE_URL) {
  try {
    // fileURLToPath, not URL.pathname — on Windows the latter yields "/C:/..."
    process.loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
  } catch {
    // No local .env — fall through to the explicit error below. In CI and in
    // deployed environments DATABASE_URL arrives from the environment instead.
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Copy server/.env.example to server/.env, or export it in your shell, before running any Prisma CLI command.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
