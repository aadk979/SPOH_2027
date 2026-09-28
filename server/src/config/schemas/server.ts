import { z } from 'zod';
import { CsvList, type EnvRule } from './common.js';

/** The process, the HTTP edge and the development conveniences. */
export const serverFields = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Exact origins only. A wildcard here would defeat the whole CORS policy.
  CORS_ALLOWED_ORIGINS: CsvList.default(['http://localhost:3000']),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX_DEFAULT: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_MAX_CAPTURE: z.coerce.number().int().min(1).default(1200),
  RATE_LIMIT_MAX_SENSITIVE: z.coerce.number().int().min(1).default(20),
  RATE_LIMIT_MAX_ADMIN: z.coerce.number().int().min(1).default(60),

  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
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
};

type ServerEnv = z.infer<z.ZodObject<typeof serverFields>>;

export const shiftHoursRule: EnvRule<ServerEnv> = (env, ctx) => {
  if (env.NODE_ENV === 'production' && env.SHIFT_HOURS_ALWAYS_OPEN) {
    ctx.addIssue({
      code: 'custom',
      path: ['SHIFT_HOURS_ALWAYS_OPEN'],
      message:
        'SHIFT_HOURS_ALWAYS_OPEN is a development convenience and is forbidden when NODE_ENV=production',
    });
  }
};

export const corsWildcardRule: EnvRule<ServerEnv> = (env, ctx) => {
  if (env.NODE_ENV === 'production' && env.CORS_ALLOWED_ORIGINS.some((o) => o.includes('*'))) {
    ctx.addIssue({
      code: 'custom',
      path: ['CORS_ALLOWED_ORIGINS'],
      message: 'wildcard origins are not permitted (BUILD_PLAN §8.2)',
    });
  }
};
