import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RedactedReplay } from '../../src/platform/http/idempotency.js';

const database = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('../../src/platform/db/client.js', () => ({
  prisma: { idempotencyRecord: database },
}));
vi.mock('../../src/platform/http/requireAuth.js', () => ({
  getAuth: () => ({ sub: 'actor', eventId: 'event' }),
}));
const { idempotent } = await import('../../src/platform/http/idempotency.js');
const { lockReserved, settleReserved } = await import('../../src/platform/idempotency/index.js');
type Row = {
  key: string;
  eventId: string;
  endpoint: string;
  actorSub: string;
  statusCode: number;
  responseBody: object;
  createdAt: Date;
};
let row: Row | undefined;
let resume!: () => void;
let committed!: () => void;
let observedCommit: Promise<void>;
const now = new Date('2027-01-07T03:30:00Z');

function matches(where: Record<string, unknown>): boolean {
  return (
    Boolean(row) &&
    Object.entries(where).every(([key, value]) => {
      const actual = row![key as keyof Row];
      return actual instanceof Date && value instanceof Date
        ? actual.getTime() === value.getTime()
        : actual === value;
    })
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  row = undefined;
  observedCommit = new Promise((done) => {
    committed = done;
  });
  database.create.mockImplementation(async ({ data }: { data: Row }) => {
    if (row) throw new Error('unique');
    row = { ...data, createdAt: data.createdAt ?? new Date() };
    committed();
    await new Promise<void>((done) => {
      resume = done;
    });
    return row;
  });
  database.findUnique.mockImplementation(async () => ({ ...row }));
  database.updateMany.mockImplementation(async ({ where, data }) => {
    if (!matches(where)) return { count: 0 };
    row = { ...row!, ...data };
    return { count: 1 };
  });
  database.deleteMany.mockImplementation(async ({ where }) => {
    if (!matches(where)) return { count: 0 };
    row = undefined;
    return { count: 1 };
  });
  database.update.mockImplementation(async ({ data }) => {
    row = { ...row!, ...data };
  });
  database.delete.mockImplementation(async () => {
    row = undefined;
  });
});
afterEach(() => {
  vi.useRealTimers();
});

function run(handler: (res: Response) => Promise<void> | void, redacted?: RedactedReplay) {
  return new Promise<{ status: number; body: unknown }>((done) => {
    const req = { body: { idempotencyKey: 'key' }, id: 'request' } as Request;
    const res = {
      statusCode: 200,
      writableEnded: false,
      status(value: number) {
        this.statusCode = value;
        return this;
      },
      json(body: unknown) {
        done({ status: this.statusCode, body });
        return this;
      },
    } as Response;
    const next: NextFunction = (error?: unknown) => {
      if (error) {
        res.status(409).json(error);
        return;
      }
      void Promise.resolve(handler(res)).catch((failure) => {
        res.status(409).json(failure);
      });
    };
    idempotent('endpoint', { redacted })(req, res, next);
  });
}

it('rejects the delayed original before effects after its retry commits', async () => {
  let effects = 0;
  const tx = {
    $queryRaw: vi.fn(async () => (row ? [{ ...row }] : [])),
    idempotencyRecord: database,
  } as unknown as Parameters<typeof settleReserved>[0];
  const handler = async (res: Response) => {
    await lockReserved(tx, { eventId: 'event' }, 'key');
    effects += 1;
    await settleReserved(
      tx,
      { eventId: 'event' },
      {
        key: 'key',
        statusCode: 201,
        body: { mutationVersion: effects },
      },
    );
    res.status(201).json({ mutationVersion: effects });
  };
  const original = run(handler);
  await observedCommit;
  vi.setSystemTime(now.getTime() + 61_001);
  const winner = await run(handler);
  expect(winner.status).toBe(201);
  resume();
  expect((await original).status).toBe(409);
  expect(effects).toBe(1);
  expect(row?.responseBody).toEqual({ mutationVersion: 1 });
});

it.each([201, 500])(
  'fences delayed nontransactional completion %s from the winner',
  async (status) => {
    const original = run((res) => {
      res.status(status).json({ winner: false });
    });
    await observedCommit;
    vi.setSystemTime(now.getTime() + 61_001);
    expect(
      (
        await run((res) => {
          res.status(201).json({ winner: true });
        })
      ).status,
    ).toBe(201);
    resume();
    await original;
    expect(row).toMatchObject({ statusCode: 201, responseBody: { winner: true } });
  },
);

it.each([undefined, { statusCode: 201 }])(
  'requires a real unfinished direct reservation: %j',
  async (value) => {
    const tx = { $queryRaw: vi.fn(async () => (value ? [value] : [])) };
    await expect(
      lockReserved(tx as Parameters<typeof lockReserved>[0], { eventId: 'event' }, 'key'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
  },
);

it('preserves the transaction’s mutation version when redacted.store rebuilds a newer definition', async () => {
  const store = vi.fn(() => ({ resourceId: 'owned', mutationVersion: 2 }));
  const tx = {
    $queryRaw: vi.fn(async () => (row ? [{ ...row }] : [])),
    idempotencyRecord: database,
  } as unknown as Parameters<typeof settleReserved>[0];
  const pending = run(
    async (res) => {
      await lockReserved(tx, { eventId: 'event' }, 'key');
      await settleReserved(
        tx,
        { eventId: 'event' },
        {
          key: 'key',
          statusCode: 201,
          body: { resourceId: 'owned', mutationVersion: 1 },
        },
      );
      res.status(201).json({ privateBody: 'fresh definition', currentVersion: 2 });
    },
    { store, replay: async (_req, stored) => stored },
  );
  await observedCommit;
  resume();
  expect((await pending).status).toBe(201);
  expect(store).toHaveBeenCalledExactlyOnceWith({
    privateBody: 'fresh definition',
    currentVersion: 2,
  });
  expect(row?.responseBody).toEqual({ resourceId: 'owned', mutationVersion: 1 });
});

it('advances ownership for same-millisecond retries whose conflicting reads were delayed', async () => {
  let conflictReads = 0;
  let continueReads!: () => void;
  let finish!: () => void;
  const reads = new Promise<void>((done) => {
    continueReads = done;
  });
  const finishing = new Promise<void>((done) => {
    finish = done;
  });
  database.findUnique.mockImplementation(async () => {
    const snapshot = { ...row };
    conflictReads += 1;
    await reads;
    return snapshot;
  });
  let effects = 0;
  const tx = {
    $queryRaw: vi.fn(async () => (row ? [{ ...row }] : [])),
    idempotencyRecord: database,
  } as unknown as Parameters<typeof settleReserved>[0];
  const handler = async (res: Response) => {
    await lockReserved(tx, { eventId: 'event' }, 'key');
    effects += 1;
    await finishing;
    await settleReserved(
      tx,
      { eventId: 'event' },
      {
        key: 'key',
        statusCode: 201,
        body: { saved: true },
      },
    );
    res.status(201).json({ saved: true });
  };
  const original = run(handler);
  await observedCommit;
  const retries = [run(handler), run(handler)];
  try {
    await expect.poll(() => conflictReads).toBe(2);
    vi.setSystemTime(now.getTime() + 61_001);
    continueReads();
    await expect.poll(() => database.updateMany.mock.calls.length).toBe(2);
    expect(effects).toBe(1);
    expect(row?.createdAt.getTime()).toBe(now.getTime() + 61_001);
    resume();
    expect((await original).status).toBe(409);
    finish();
    expect((await Promise.all(retries)).map((result) => result.status).sort()).toEqual([201, 409]);
  } finally {
    continueReads();
    resume();
    finish();
    await Promise.all([original, ...retries]);
  }
});
