import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Boot-time configuration.
 *
 * `process.env` is parsed once, here, and the server refuses to start on a
 * missing or malformed value (BUILD_PLAN §4). Nothing else in the codebase
 * reads `process.env` directly — an import of this module is the only way to
 * reach configuration, so a typo in a variable name fails at boot rather than
 * at 10am on 7 January.
 */

/**
 * Load `server/.env` for local development. In CI and in deployed environments
 * the variables arrive from the environment itself and this is a no-op.
 */
function loadLocalEnvFile(): void {
  if (process.env.SPOH_SKIP_DOTENV === '1') return;
  try {
    // fileURLToPath, not URL.pathname — on Windows the latter yields "/C:/...".
    process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
  } catch {
    // No .env file. Expected everywhere except a developer machine.
  }
}

loadLocalEnvFile();

/** Comma-separated list -> trimmed, de-duplicated, non-empty array. */
const CsvList = z.string().transform((raw) => [
  ...new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
]);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.string().min(1).startsWith('postgresql://'),

    AUTH_PROVIDER: z.enum(['cognito', 'local']).default('cognito'),
    LOCAL_AUTH_SECRET: z.string().min(32).optional(),
    COGNITO_REGION: z.string().min(1).default('ap-southeast-1'),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),

    // Exact origins only. A wildcard here would defeat the whole CORS policy.
    CORS_ALLOWED_ORIGINS: CsvList.default(['http://localhost:3000']),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    RATE_LIMIT_MAX_DEFAULT: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_MAX_CAPTURE: z.coerce.number().int().min(1).default(1200),
    RATE_LIMIT_MAX_SENSITIVE: z.coerce.number().int().min(1).default(20),

    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    /**
     * Postgres connection pool size.
     *
     * At peak roughly 80 volunteers capture concurrently, and every capture is
     * a short transaction. A pool of 5 turns that into a queue: the load test
     * showed p50 13ms and p95 547ms, which is not a slow database, it is
     * requests waiting for a connection. RDS t4g.small allows far more than
     * this, so the ceiling is instance count x pool size, not the pool alone.
     */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(25),

    S3_MEDIA_BUCKET: z.string().optional(),
    AWS_REGION: z.string().default('ap-southeast-1'),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_PROVIDER === 'cognito') {
      if (!env.COGNITO_USER_POOL_ID) {
        ctx.addIssue({
          code: 'custom',
          path: ['COGNITO_USER_POOL_ID'],
          message: 'required when AUTH_PROVIDER=cognito',
        });
      }
      if (!env.COGNITO_CLIENT_ID) {
        ctx.addIssue({
          code: 'custom',
          path: ['COGNITO_CLIENT_ID'],
          message: 'required when AUTH_PROVIDER=cognito',
        });
      }
    }

    if (env.AUTH_PROVIDER === 'local') {
      // The local provider mints its own tokens. Allowing it in production
      // would be a complete authentication bypass, so it is refused at boot
      // rather than guarded at each call site.
      if (env.NODE_ENV === 'production') {
        ctx.addIssue({
          code: 'custom',
          path: ['AUTH_PROVIDER'],
          message:
            'AUTH_PROVIDER=local is a development-only authentication bypass and is forbidden when NODE_ENV=production',
        });
      }
      if (!env.LOCAL_AUTH_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['LOCAL_AUTH_SECRET'],
          message: 'required when AUTH_PROVIDER=local',
        });
      }
    }

    if (env.NODE_ENV === 'production' && !env.DATABASE_URL.includes('sslmode=require')) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'production DATABASE_URL must specify sslmode=require (BUILD_PLAN §8.8)',
      });
    }

    if (env.NODE_ENV === 'production' && env.CORS_ALLOWED_ORIGINS.some((o) => o.includes('*'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ALLOWED_ORIGINS'],
        message: 'wildcard origins are not permitted (BUILD_PLAN §8.2)',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse and validate. Exported for tests, which build an env from a fixture
 * rather than mutating `process.env`.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid server configuration:\n${issues}`);
  }

  return result.data;
}

export const env: Env = parseEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
