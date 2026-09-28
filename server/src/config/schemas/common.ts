import { z } from 'zod';

/** Comma-separated list -> trimmed, de-duplicated, non-empty array. */
export const CsvList = z.string().transform((raw) => [
  ...new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
]);

/** A boot-time rule across fields: adds an issue to `ctx` when it is broken. */
export type EnvRule<T> = (env: T, ctx: z.RefinementCtx) => void;

export type NodeEnv = 'development' | 'test' | 'production';
