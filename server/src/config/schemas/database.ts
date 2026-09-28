import { z } from 'zod';
import type { EnvRule, NodeEnv } from './common.js';

/** Postgres. */
export const databaseFields = {
  DATABASE_URL: z.string().min(1).startsWith('postgresql://'),

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
};

type DatabaseEnv = z.infer<z.ZodObject<typeof databaseFields>> & { NODE_ENV: NodeEnv };

export const databaseSslRule: EnvRule<DatabaseEnv> = (env, ctx) => {
  if (env.NODE_ENV === 'production' && !env.DATABASE_URL.includes('sslmode=require')) {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'production DATABASE_URL must specify sslmode=require (BUILD_PLAN §8.8)',
    });
  }
};
