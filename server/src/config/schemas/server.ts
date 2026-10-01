import { z } from 'zod';
import { CsvList, type EnvRule } from './common.js';

/** The process, the HTTP edge and the development conveniences. */
export const serverFields = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Exact origins only. A wildcard here would defeat the whole CORS policy.
  CORS_ALLOWED_ORIGINS: CsvList.default(['http://localhost:3000']),

  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /**
   * The client's static export, served by this process on the same origin as
   * the API (ADR-008 §2). Unset in development, where Next serves the client.
   */
  CLIENT_DIR: z.string().min(1).optional(),
};

type ServerEnv = z.infer<z.ZodObject<typeof serverFields>>;

export const corsWildcardRule: EnvRule<ServerEnv> = (env, ctx) => {
  if (env.NODE_ENV === 'production' && env.CORS_ALLOWED_ORIGINS.some((o) => o.includes('*'))) {
    ctx.addIssue({
      code: 'custom',
      path: ['CORS_ALLOWED_ORIGINS'],
      message: 'wildcard origins are not permitted (BUILD_PLAN §8.2)',
    });
  }
};
