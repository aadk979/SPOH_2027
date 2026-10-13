import { beforeEach, describe, expect, it } from 'vitest';
import { prisma, type PrismaTransactionClient } from '../../src/platform/db/client.js';
import { DynamicRateLimitStore } from '../../src/platform/http/dynamicRateLimitStore.js';
import { incrementCounter, readCounter, refundCounter, resetCounter, pruneExpiredCounters } from '../../src/platform/http/quotaCounterRepo.js';
import { parseQuotaKey, quotaKey } from '../../src/platform/http/quotaKeys.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { FROZEN_NOW } from '../setup.js';

const db = rawDb as unknown as PrismaTransactionClient;
const key = (organisation = 'one', namespace: 'http.default' | 'http.capture' = 'http.default') =>
  quotaKey({ namespace, scope: [organisation, 10], subject: 'sub:shared-person', windowSeconds: 10 });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((ready) => { resolve = ready; });
  return { promise, resolve };
}
beforeEach(async () => { await resetDatabase(); });

describe('shared SQL quota generations', () => {
  it('serializes independent stores and concurrent exact counts without a local fallback', async () => {
    const first = new DynamicRateLimitStore('http.default', { db });
    // Root app pool and raw helper pool are independent database clients.
    const second = new DynamicRateLimitStore('http.default', { db: prisma });
    const results = await Promise.all(Array.from({ length: 24 }, (_, index) => (index % 2 ? first : second).increment(key())));
    expect(results.map((row) => row.totalHits).sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
    expect(new Set(results.map((row) => row.resetTime?.getTime())).size).toBe(1);
    expect(await first.get(key())).toMatchObject({ totalHits: 24 });
    expect(await second.get(key())).toMatchObject({ totalHits: 24 });
  });

  it('separates namespaces/scopes and resets only the exact subject namespace', async () => {
    const first = new DynamicRateLimitStore('http.default', { db });
    const capture = new DynamicRateLimitStore('http.capture', { db });
    await first.increment(key('one'));
    await first.increment(key('two'));
    await capture.increment(key('one', 'http.capture'));
    await first.resetSubject('sub:shared-person');
    expect(await first.get(key('one'))).toBeUndefined();
    expect(await first.get(key('two'))).toBeUndefined();
    expect(await capture.get(key('one', 'http.capture'))).toMatchObject({ totalHits: 1 });
  });

  it('fences stale refunds after expiry and explicit reset while retaining exact reset time', async () => {
    const spec = parseQuotaKey(key(), 'http.default');
    const first = await incrementCounter(db, spec, FROZEN_NOW);
    const later = new Date(FROZEN_NOW.getTime() + 10_000);
    const second = await incrementCounter(db, spec, later);
    expect(second.opened).toBe(true);
    expect(second.charge.generation).not.toBe(first.charge.generation);
    expect(second.previousWindowHits).toBe(1n);
    expect(await refundCounter(db, first.charge, later)).toBe(false);
    expect((await readCounter(db, spec, later))?.totalHits).toBe(1n);
    await resetCounter(db, spec);
    const third = await incrementCounter(db, spec, later);
    expect(await refundCounter(db, second.charge, later)).toBe(false);
    expect(third.charge.resetTime).toEqual(new Date(later.getTime() + 10_000));
    expect((await readCounter(db, spec, later))?.totalHits).toBe(1n);
  });

  it('does not mistake a refunded zero-count active window for a newly opened audit claim', async () => {
    const spec = parseQuotaKey(key(), 'http.default');
    const first = await incrementCounter(db, spec, FROZEN_NOW);
    expect(await refundCounter(db, first.charge, FROZEN_NOW)).toBe(true);
    const next = await incrementCounter(db, spec, FROZEN_NOW);
    expect(next.totalHits).toBe(1n);
    expect(next.opened).toBe(false);
    expect(next.charge.generation).toBe(first.charge.generation);
  });

  it('rolls the first claim back with a failed audit transaction', async () => {
    const spec = { ...parseQuotaKey(key(), 'http.default'), namespace: 'authorization.denial' as const };
    await expect(rawDb.$transaction(async (tx) => {
      await incrementCounter(tx as unknown as PrismaTransactionClient, spec, FROZEN_NOW);
      throw new Error('audit transaction failed');
    })).rejects.toThrow('audit transaction failed');
    expect(await readCounter(db, spec, FROZEN_NOW)).toBeNull();
    expect((await incrementCounter(db, spec, FROZEN_NOW)).opened).toBe(true);
  });

  it('cleans only bounded expired counters and retains active and recent denial history', async () => {
    const old = new Date(FROZEN_NOW.getTime() - 7_200_000);
    await incrementCounter(db, parseQuotaKey(key('old-one'), 'http.default'), old);
    await incrementCounter(db, parseQuotaKey(key('old-two'), 'http.default'), old);
    const active = parseQuotaKey(key('active'), 'http.default');
    await incrementCounter(db, active, FROZEN_NOW);
    const recent = { ...parseQuotaKey(key('recent'), 'http.default'), namespace: 'authorization.denial' as const };
    await incrementCounter(db, recent, new Date(FROZEN_NOW.getTime() - 60_000));
    expect(await pruneExpiredCounters(db, { before: FROZEN_NOW, limit: 1 })).toBe(1);
    expect((await readCounter(db, active, FROZEN_NOW))?.totalHits).toBe(1n);
    const rows = await rawDb.$queryRaw<Array<{ namespace: string }>>`SELECT namespace FROM "RateLimitCounter"`;
    expect(rows).toHaveLength(3);
    expect(rows.some((row) => row.namespace === 'authorization.denial')).toBe(true);
  });

  it('skips a locked expired generation without blocking and removes it after its owner releases', async () => {
    const old = new Date(FROZEN_NOW.getTime() - 7_200_000);
    const locked = parseQuotaKey(key('locked-old'), 'http.default');
    const other = parseQuotaKey(key('other-old'), 'http.default');
    await incrementCounter(db, locked, old);
    await incrementCounter(db, other, old);
    const ready = deferred();
    const release = deferred();
    const owner = rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT generation FROM "RateLimitCounter"
        WHERE namespace = ${locked.namespace} AND "scopeDigest" = ${locked.scopeDigest}
          AND "subjectDigest" = ${locked.subjectDigest} FOR UPDATE`;
      ready.resolve();
      await release.promise;
    });
    try {
      await ready.promise;
      // A short database timeout makes a missing SKIP LOCKED fail, rather than hang.
      const count = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '1000ms'`;
        return pruneExpiredCounters(tx, { before: FROZEN_NOW, limit: 2 });
      });
      expect(count).toBe(1);
      const rows = await rawDb.$queryRaw<Array<{ scopeDigest: string }>>`
        SELECT "scopeDigest" FROM "RateLimitCounter"`;
      expect(rows).toEqual([{ scopeDigest: locked.scopeDigest }]);
    } finally { release.resolve(); await owner; }
    expect(await pruneExpiredCounters(db, { before: FROZEN_NOW, limit: 2 })).toBe(1);
  });
});
