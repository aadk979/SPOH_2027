import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseCidr } from '../lib/campusNetwork.js';

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
    RATE_LIMIT_MAX_ADMIN: z.coerce.number().int().min(1).default(60),

    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    ATTENDANCE_ROOT_EMAIL: z
      .email()
      .transform((value) => value.toLowerCase())
      .optional(),
    ATTENDANCE_SIGNING_SECRET: z.string().min(32).optional(),
    ATTENDANCE_SP_CIDRS: CsvList.default([]).superRefine((cidrs, ctx) => {
      for (const cidr of cidrs) {
        try {
          parseCidr(cidr);
        } catch {
          ctx.addIssue({ code: 'custom', message: `Invalid campus CIDR: ${cidr}` });
        }
      }
    }),

    /**
     * Treat every hour as event hours. DEVELOPMENT ONLY.
     *
     * Station scoping requires a shift block to be running, which outside
     * 09:30-18:00 Singapore means no capture screen works at all. Correct for
     * the event — a counter left open overnight must not keep writing — and
     * unworkable for a student team testing at 10pm.
     *
     * Refused in production, where a counter that never closes would let a
     * volunteer capture against a station they left hours ago.
     */
    SHIFT_HOURS_ALWAYS_OPEN: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

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
    /** Seconds a presigned upload policy stays valid. */
    S3_UPLOAD_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    /** Ceiling written into the presigned policy, so S3 enforces it too. */
    S3_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(50 * 1024 * 1024)
      .default(10 * 1024 * 1024),

    /**
     * Signing key for the API's own access tokens.
     *
     * The API issues its own short-lived token rather than passing the identity
     * provider's straight through, which is what makes the refresh path
     * possible. Required in production; outside it an ephemeral key is
     * generated at boot, so a developer machine needs no extra configuration
     * and every restart simply invalidates its own sessions.
     */
    SESSION_SIGNING_SECRET: z.string().min(32).optional(),
    /** Access-token lifetime. Short, because a refresh cookie renews it. */
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    /**
     * Domain for the refresh cookie. Leave unset for a host-only cookie, which
     * is correct when the API and client share an origin or a parent domain is
     * not required.
     */
    SESSION_COOKIE_DOMAIN: z.string().optional(),
    /**
     * Send the refresh cookie cross-site.
     *
     * Needed when the client is served from a different origin than the API,
     * which is the deployed topology. SameSite=None demands Secure, so this is
     * refused without HTTPS in production.
     */
    SESSION_COOKIE_CROSS_SITE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    /**
     * VAPID keys for Web Push. Absent means push is simply off — the ten-second
     * alert poll and the three-second dashboard poll are the contract either
     * way, so an unconfigured deployment is a quieter system, not a broken one.
     */
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    /** `mailto:` or `https:` contact the push service can reach, per RFC 8292. */
    VAPID_SUBJECT: z.string().optional(),
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

    if (env.NODE_ENV === 'production' && env.SHIFT_HOURS_ALWAYS_OPEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['SHIFT_HOURS_ALWAYS_OPEN'],
        message:
          'SHIFT_HOURS_ALWAYS_OPEN is a development convenience and is forbidden when NODE_ENV=production',
      });
    }

    if (env.NODE_ENV === 'production' && !env.DATABASE_URL.includes('sslmode=require')) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'production DATABASE_URL must specify sslmode=require (BUILD_PLAN §8.8)',
      });
    }

    if (env.NODE_ENV === 'production' && !env.SESSION_SIGNING_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SIGNING_SECRET'],
        message:
          'required in production: an ephemeral key would sign out every volunteer on each deploy and every instance would reject the others tokens',
      });
    }

    if (
      env.NODE_ENV === 'production' &&
      env.SESSION_COOKIE_CROSS_SITE &&
      env.CORS_ALLOWED_ORIGINS.some((origin) => origin.startsWith('http://'))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_CROSS_SITE'],
        message:
          'a cross-site refresh cookie requires SameSite=None, which browsers only accept with Secure — every allowed origin must be https',
      });
    }

    // Half a VAPID pair is a misconfiguration that would otherwise surface as
    // silent non-delivery of exactly the alerts that matter most.
    const vapid = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT];
    if (vapid.some(Boolean) && !vapid.every(Boolean)) {
      ctx.addIssue({
        code: 'custom',
        path: ['VAPID_PUBLIC_KEY'],
        message:
          'set all three of VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT, or none of them',
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
