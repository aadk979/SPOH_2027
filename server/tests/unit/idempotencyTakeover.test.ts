import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

/**
 * F03-011: of two retries that both find the same abandoned reservation, only
 * one may take it over. Driven with a fake database so the interleaving the
 * race needs happens every time: both retries read the stale row, then both
 * try the takeover.
 */

const stale = {
  key: 'k1',
  eventId: 'event-1',
  endpoint: 'POST /registrations',
  actorSub: 'sub-1',
  statusCode: 0,
  responseBody: {},
  createdAt: new Date(Date.now() - 5 * 60_000),
};

const db = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('../../src/platform/db/client.js', () => ({
  prisma: { idempotencyRecord: db },
}));
vi.mock('../../src/platform/http/requireAuth.js', () => ({
  getAuth: () => ({ sub: 'sub-1', eventId: 'event-1' }),
}));

const { idempotent } = await import('../../src/platform/http/idempotency.js');

function run(middleware: ReturnType<typeof idempotent>): Promise<unknown[]> {
  return new Promise((resolve) => {
    const req = { body: { idempotencyKey: 'k1' }, id: 'r' } as unknown as Request;
    const res = { json: vi.fn(), status: vi.fn() } as unknown as Response;
    const next: NextFunction = (...args: unknown[]) => resolve(args);
    middleware(req, res, next);
  });
}

describe('abandoned idempotency reservations (F03-011)', () => {
  it.each([null, 'other-event'])(
    'refuses an abandoned key owned by %s before takeover',
    async (eventId) => {
      db.create.mockRejectedValue(new Error('unique violation'));
      db.findUnique.mockResolvedValue({ ...stale, eventId });
      db.updateMany.mockClear();
      const result = await run(idempotent('POST /registrations'));
      expect(result[0]).toMatchObject({ statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSE' });
      expect(db.updateMany).not.toHaveBeenCalled();
    },
  );

  it('lets exactly one of two racing retries take the key over', async () => {
    db.create.mockRejectedValue(new Error('unique violation'));
    db.findUnique.mockResolvedValue(stale);
    // The database applies the first conditional update and rejects the second,
    // whose WHERE no longer matches the refreshed createdAt.
    db.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const middleware = idempotent('POST /registrations');
    const [first, second] = await Promise.all([run(middleware), run(middleware)]);

    expect(db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'k1', createdAt: stale.createdAt }),
      }),
    );
    const outcomes = [first, second].map(
      (args) => (args[0] as { code?: string } | undefined)?.code,
    );
    expect(outcomes.filter((code) => code === undefined)).toHaveLength(1);
    expect(outcomes.filter((code) => code === 'IDEMPOTENCY_IN_PROGRESS')).toHaveLength(1);
  });
});
