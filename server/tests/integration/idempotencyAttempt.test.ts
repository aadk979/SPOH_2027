import { randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { prisma } from '../../src/platform/db/client.js';
import { idempotent } from '../../src/platform/http/idempotency.js';
import { errorHandler } from '../../src/platform/http/errorHandler.js';
import {
  lockReserved,
  reserve,
  settleReserved,
  withReservationAttempt,
} from '../../src/platform/idempotency/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let eventId: string;
let admin: TestVolunteer;
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'attempt-admin@test.example', role: 'ADMIN' });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.setSystemTime(FROZEN_NOW);
});
const owner = (key: string) => ({ key, eventId, actorSub: admin.sub, endpoint: 'test.attempt' });
const record = (key: string) => rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key } });

function delayCommittedReservation() {
  let resume!: () => void;
  let committed!: () => void;
  const observed = new Promise<void>((done) => {
    committed = done;
  });
  // reserve only awaits a data-only insert; the spy does not emulate Prisma's
  // fluent relation API or its generic selected projections.
  const delegate = prisma.idempotencyRecord as {
    create(
      args: Pick<Parameters<typeof prisma.idempotencyRecord.create>[0], 'data'>,
    ): Promise<Awaited<ReturnType<typeof prisma.idempotencyRecord.create>>>;
  };
  const create = delegate.create.bind(delegate);
  vi.spyOn(delegate, 'create').mockImplementationOnce(async (args) => {
    const row = await create(args);
    committed();
    await new Promise<void>((done) => {
      resume = done;
    });
    return row;
  });
  return { observed, resume: () => resume() };
}

const postBatch = (key: string) =>
  request(app)
    .post(`/api/v1/events/${eventId}/cards/batch`)
    .set('Authorization', bearer(admin))
    .send({ count: 2, batchLabel: 'Fenced print', rehearsal: true, idempotencyKey: key });

it('fences a real insert response delayed past takeover before minting a second batch', async () => {
  const key = randomUUID();
  const delayed = delayCommittedReservation();
  const original = postBatch(key).then((response) => response);
  await delayed.observed;
  const abandoned = await record(key);
  expect(abandoned.createdAt).toEqual(FROZEN_NOW);
  vi.setSystemTime(FROZEN_NOW.getTime() + 61_001);
  try {
    const winner = await postBatch(key);
    expect(winner.status).toBe(201);
    const receipt = await record(key);
    delayed.resume();
    const loser = await original;
    expect(loser.status).toBe(409);
    expect(loser.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    expect(await rawDb.missionCard.count({ where: { eventId } })).toBe(2);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'card.batch' } })).toBe(1);
    expect(await record(key)).toEqual(receipt);
    expect((await postBatch(key)).body).toEqual(winner.body);
  } finally {
    delayed.resume();
    await original;
  }
});

it('refreshes the fence for same-millisecond requests after their conflict reads were delayed', async () => {
  const key = randomUUID();
  const delayed = delayCommittedReservation();
  const original = postBatch(key).then((response) => response);
  await delayed.observed;
  let count = 0;
  let continueReads!: () => void;
  const gate = new Promise<void>((done) => {
    continueReads = done;
  });
  const delegate = prisma.idempotencyRecord as {
    findUnique(args: {
      where: { key: string };
    }): Promise<Awaited<ReturnType<typeof prisma.idempotencyRecord.findUnique>>>;
  };
  const read = delegate.findUnique.bind(delegate);
  vi.spyOn(delegate, 'findUnique').mockImplementation(async (args) => {
    const snapshot = await read(args);
    count += 1;
    await gate;
    return snapshot;
  });
  const retries = [
    postBatch(key).then((response) => response),
    postBatch(key).then((response) => response),
  ];
  try {
    await expect.poll(() => count).toBe(2);
    expect((await record(key)).createdAt).toEqual(FROZEN_NOW);
    vi.setSystemTime(FROZEN_NOW.getTime() + 61_001);
    continueReads();
    const results = await Promise.all(retries);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    const receipt = await record(key);
    expect(receipt.createdAt).toEqual(new Date(FROZEN_NOW.getTime() + 61_001));
    expect(receipt.statusCode).toBe(201);
    delayed.resume();
    expect((await original).status).toBe(409);
    expect(await record(key)).toEqual(receipt);
    expect(await rawDb.missionCard.count({ where: { eventId } })).toBe(2);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'card.batch' } })).toBe(1);
  } finally {
    continueReads();
    delayed.resume();
    await Promise.all([original, ...retries]);
  }
});

function bookkeepingApp(handler: RequestHandler) {
  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    req.auth = {
      sub: admin.sub,
      volunteerId: admin.id,
      eventId,
      membershipId: 'synthetic-membership',
      role: 'ADMIN',
      displayName: 'Synthetic admin',
    } as NonNullable<typeof req.auth>;
    next();
  });
  testApp.post('/attempt', idempotent('test.attempt'), handler);
  testApp.use(errorHandler);
  return testApp;
}

it.each([201, 500])(
  'retains the winner when delayed nontransactional response is %s',
  async (status) => {
    const key = randomUUID();
    const testApp = bookkeepingApp((req, res) => {
      res.status(req.body.original ? status : 201).json({ winner: !req.body.original });
    });
    const delayed = delayCommittedReservation();
    const original = request(testApp)
      .post('/attempt')
      .send({ idempotencyKey: key, original: true })
      .then((response) => response);
    await delayed.observed;
    vi.setSystemTime(FROZEN_NOW.getTime() + 61_001);
    try {
      expect((await request(testApp).post('/attempt').send({ idempotencyKey: key })).status).toBe(
        201,
      );
      const receipt = await record(key);
      delayed.resume();
      expect((await original).status).toBe(status);
      expect(await record(key)).toEqual(receipt);
      expect(receipt.responseBody).toEqual({ winner: true });
    } finally {
      delayed.resume();
      await original;
    }
  },
);

it('releases its own failed unfinished reservation so a fresh retry succeeds', async () => {
  const key = randomUUID();
  let status = 500;
  const testApp = bookkeepingApp((_req, res) => {
    res.status(status).json({ saved: status === 201 });
  });
  expect((await request(testApp).post('/attempt').send({ idempotencyKey: key })).status).toBe(500);
  expect(await rawDb.idempotencyRecord.findUnique({ where: { key } })).toBeNull();
  status = 201;
  expect((await request(testApp).post('/attempt').send({ idempotencyKey: key })).status).toBe(201);
  expect((await record(key)).responseBody).toEqual({ saved: true });
});

it.each(['absent', 'completed', 'foreign'] as const)(
  'rejects a %s direct reservation before effects',
  async (kind) => {
    const key = randomUUID();
    if (kind !== 'absent') {
      await reserve(key, { endpoint: 'test.attempt', actorSub: admin.sub, eventId });
      if (kind === 'completed')
        await rawDb.idempotencyRecord.update({ where: { key }, data: { statusCode: 201 } });
    }
    await expect(
      rawDb.$transaction((tx) =>
        lockReserved(tx, { eventId: kind === 'foreign' ? randomUUID() : eventId }, key),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
  },
);

it.each(['key', 'eventId', 'endpoint', 'actorSub'] as const)(
  'cannot bypass an active HTTP owner by changing %s',
  async (field) => {
    const key = randomUUID();
    await reserve(key, owner(key));
    const changed = { ...owner(key), [field]: randomUUID() };
    await expect(
      withReservationAttempt(changed, () =>
        rawDb.$transaction(async (tx) => {
          await lockReserved(tx, { eventId }, key);
          await tx.event.update({ where: { id: eventId }, data: { name: 'Forbidden change' } });
        }),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
    expect((await rawDb.event.findUniqueOrThrow({ where: { id: eventId } })).name).toBe(
      'Test Event',
    );
    expect((await record(key)).statusCode).toBe(0);
  },
);

it('rejects a refreshed but still unfinished row belonging to another HTTP attempt', async () => {
  const key = randomUUID();
  await reserve(key, owner(key));
  vi.setSystemTime(FROZEN_NOW.getTime() + 61_001);
  await expect(
    withReservationAttempt(owner(key), () =>
      rawDb.$transaction((tx) => lockReserved(tx, { eventId }, key)),
    ),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
  expect((await record(key)).createdAt).toEqual(FROZEN_NOW);
});

it('rolls all effects back when the final conditional settlement loses its fence', async () => {
  const key = randomUUID();
  await withReservationAttempt(owner(key), async () => {
    await reserve(key, owner(key));
    await expect(
      rawDb.$transaction(async (tx) => {
        await lockReserved(tx, { eventId }, key);
        await tx.event.update({ where: { id: eventId }, data: { name: 'Must roll back' } });
        vi.spyOn(tx.idempotencyRecord, 'updateMany').mockResolvedValueOnce({ count: 0 });
        await settleReserved(
          tx as Parameters<typeof settleReserved>[0],
          { eventId },
          {
            key,
            statusCode: 201,
            body: { mutationVersion: 1 },
          },
        );
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
  });
  expect((await rawDb.event.findUniqueOrThrow({ where: { id: eventId } })).name).toBe('Test Event');
  expect((await record(key)).statusCode).toBe(0);
});

it('does not replace a committed private mutation version with the response’s newer definition', async () => {
  const key = randomUUID();
  const testApp = bookkeepingApp(async (req, res, next) => {
    try {
      await rawDb.$transaction(async (tx) => {
        await lockReserved(tx, { eventId }, key);
        await settleReserved(
          tx as Parameters<typeof settleReserved>[0],
          { eventId },
          {
            key,
            statusCode: 201,
            body: { resourceId: 'owned', mutationVersion: 1 },
          },
        );
      });
      res.status(201).json({ resourceId: 'owned', mutationVersion: 2 });
    } catch (error) {
      next(error);
    }
  });
  expect((await request(testApp).post('/attempt').send({ idempotencyKey: key })).status).toBe(201);
  expect((await record(key)).responseBody).toEqual({ resourceId: 'owned', mutationVersion: 1 });
});

it('keeps simultaneous HTTP owners and their asynchronous continuations isolated', async () => {
  const keys = [randomUUID(), randomUUID()];
  const testApp = bookkeepingApp(async (req, res, next) => {
    try {
      await new Promise<void>((done) => {
        setImmediate(done);
      });
      await rawDb.$transaction(async (tx) => {
        await lockReserved(tx, { eventId }, req.body.idempotencyKey);
        await settleReserved(
          tx as Parameters<typeof settleReserved>[0],
          { eventId },
          {
            key: req.body.idempotencyKey,
            statusCode: 201,
            body: { id: req.body.idempotencyKey },
          },
        );
      });
      res.status(201).json({ id: req.body.idempotencyKey });
    } catch (error) {
      next(error);
    }
  });
  const responses = await Promise.all(
    keys.map((key) => request(testApp).post('/attempt').send({ idempotencyKey: key })),
  );
  expect(responses.map((response) => response.status)).toEqual([201, 201]);
  for (const key of keys) expect((await record(key)).responseBody).toEqual({ id: key });
});
