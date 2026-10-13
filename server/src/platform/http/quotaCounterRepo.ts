import { randomUUID } from 'node:crypto';
import type { PrismaTransactionClient } from '../db/client.js';

export type QuotaNamespace = 'http.default' | 'http.capture' | 'http.sensitive' | 'http.admin'
  | 'http.sign-in-failure' | 'authorization.denial';
export interface CounterKey {
  readonly namespace: QuotaNamespace;
  readonly scopeDigest: string;
  readonly subjectDigest: string;
}
export interface CounterSpec extends CounterKey { readonly windowSeconds: number }
export interface CounterCharge extends CounterKey {
  readonly generation: string;
  readonly resetTime: Date;
}
export interface CounterIncrement {
  readonly charge: CounterCharge;
  readonly totalHits: bigint;
  readonly previousWindowHits: bigint;
  readonly opened: boolean;
}
type CounterDb = Pick<PrismaTransactionClient, '$queryRaw' | '$executeRaw'>;
interface CounterRow extends CounterKey {
  generation: string;
  expiresAt: Date;
  count: bigint;
  previousWindowCount: bigint;
}

function result(row: CounterRow, candidate?: string): CounterIncrement {
  return { charge: { namespace: row.namespace, scopeDigest: row.scopeDigest,
    subjectDigest: row.subjectDigest, generation: row.generation, resetTime: row.expiresAt },
    totalHits: row.count, previousWindowHits: row.previousWindowCount,
    opened: row.generation === candidate };
}

/** One SQL statement serializes a shared fixed window, including its first audit claim. */
export async function incrementCounter(db: CounterDb, spec: CounterSpec, now: Date) {
  const generation = randomUUID();
  const expiry = new Date(now.getTime() + spec.windowSeconds * 1_000);
  const [row] = await db.$queryRaw<CounterRow[]>`
    INSERT INTO "RateLimitCounter" AS c (namespace, "scopeDigest", "subjectDigest", generation,
      "windowStart", "expiresAt", count, "previousWindowCount")
    VALUES (${spec.namespace}, ${spec.scopeDigest}, ${spec.subjectDigest}, ${generation}::uuid,
      ${now}::timestamptz, ${expiry}::timestamptz, 1, 0)
    ON CONFLICT (namespace, "scopeDigest", "subjectDigest") DO UPDATE SET
      generation = CASE WHEN c."expiresAt" <= ${now} THEN EXCLUDED.generation ELSE c.generation END,
      "windowStart" = CASE WHEN c."expiresAt" <= ${now} THEN EXCLUDED."windowStart" ELSE c."windowStart" END,
      "expiresAt" = CASE WHEN c."expiresAt" <= ${now} THEN EXCLUDED."expiresAt" ELSE c."expiresAt" END,
      "previousWindowCount" = CASE WHEN c."expiresAt" <= ${now} THEN c.count ELSE c."previousWindowCount" END,
      count = CASE WHEN c."expiresAt" <= ${now} THEN 1 ELSE c.count + 1 END
    RETURNING namespace, "scopeDigest", "subjectDigest", generation, "expiresAt", count, "previousWindowCount"`;
  if (!row) throw new Error('Quota increment returned no counter');
  return result(row, generation);
}

/** A delayed finish cannot refund the generation opened by a later request/reset. */
export async function refundCounter(db: CounterDb, charge: CounterCharge, now: Date) {
  const changed = await db.$executeRaw`UPDATE "RateLimitCounter"
    SET count = GREATEST(count - 1, 0)
    WHERE namespace = ${charge.namespace} AND "scopeDigest" = ${charge.scopeDigest}
      AND "subjectDigest" = ${charge.subjectDigest} AND generation = ${charge.generation}::uuid
      AND "expiresAt" > ${now}::timestamptz`;
  return changed === 1;
}

export async function readCounter(db: CounterDb, key: CounterKey, now: Date) {
  const [row] = await db.$queryRaw<CounterRow[]>`SELECT namespace, "scopeDigest", "subjectDigest",
    generation, "expiresAt", count, "previousWindowCount" FROM "RateLimitCounter"
    WHERE namespace = ${key.namespace} AND "scopeDigest" = ${key.scopeDigest}
      AND "subjectDigest" = ${key.subjectDigest} AND "expiresAt" > ${now}::timestamptz`;
  return row ? result(row) : null;
}

export async function resetCounter(db: CounterDb, key: CounterKey): Promise<void> {
  await db.$executeRaw`DELETE FROM "RateLimitCounter" WHERE namespace = ${key.namespace}
    AND "scopeDigest" = ${key.scopeDigest} AND "subjectDigest" = ${key.subjectDigest}`;
}
export async function resetCounterSubject(db: CounterDb, input: Pick<CounterKey, 'namespace' | 'subjectDigest'>): Promise<void> {
  await db.$executeRaw`DELETE FROM "RateLimitCounter" WHERE namespace = ${input.namespace}
    AND "subjectDigest" = ${input.subjectDigest}`;
}
export async function resetCounterNamespace(db: CounterDb, namespace: QuotaNamespace): Promise<void> {
  await db.$executeRaw`DELETE FROM "RateLimitCounter" WHERE namespace = ${namespace}`;
}

/** Bounded indexed maintenance; expired denial history remains for one inactive hour. */
export async function pruneExpiredCounters(db: CounterDb, input: { before: Date; limit?: number }) {
  const limit = input.limit ?? 1_000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new Error('Invalid quota cleanup limit');
  const denialBefore = new Date(input.before.getTime() - 3_600_000);
  return db.$executeRaw`WITH expired AS (
    SELECT namespace, "scopeDigest", "subjectDigest", generation FROM "RateLimitCounter"
    WHERE "expiresAt" <= ${input.before}::timestamptz
      AND (namespace <> 'authorization.denial' OR "expiresAt" <= ${denialBefore}::timestamptz)
    ORDER BY "expiresAt", namespace, "scopeDigest", "subjectDigest"
    LIMIT ${limit} FOR UPDATE SKIP LOCKED
  ) DELETE FROM "RateLimitCounter" c USING expired e
    WHERE c.namespace = e.namespace AND c."scopeDigest" = e."scopeDigest"
      AND c."subjectDigest" = e."subjectDigest" AND c.generation = e.generation`;
}
