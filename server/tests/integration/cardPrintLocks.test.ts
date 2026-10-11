import request from 'supertest';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { createApp } from '../../src/app/createApp.js';
import { printCardBatch } from '../../src/modules/missionCard/application/printBatch.js';
import { useCardPrintStorage } from '../../src/modules/missionCard/application/printStorage.js';
import type { ActorContext } from '../../src/platform/http/auditContext.js';
import {
  bearer,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { rawDb, resetDatabase } from '../helpers/db.js';

const app = createApp();
let eventId: string;
let admin: TestVolunteer;
let actor: ActorContext;
let restore: (() => void) | undefined;
let uploads: Map<string, Buffer>;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'printer-lock@print.test', role: 'ADMIN' });
  const membership = await rawDb.eventMembership.findFirstOrThrow({
    where: { eventId, personId: admin.id },
  });
  actor = {
    scope: { eventId },
    volunteerId: admin.id,
    membershipId: membership.id,
    audit: {
      eventId,
      actorId: admin.id,
      actorSub: admin.sub,
      membershipId: membership.id,
      ip: null,
      userAgent: null,
      requestId: null,
    },
  };
  uploads = new Map();
  restore = useCardPrintStorage({
    async write({ key, body }) {
      uploads.set(key, body);
    },
    async read(key) {
      return uploads.get(key)!;
    },
  });
  await rawDb.missionCard.createMany({
    data: [
      { eventId, shortCode: 'ABC123', qrPayload: 'opaque:lock-one', status: 'UNISSUED' },
      { eventId, shortCode: 'ABC124', qrPayload: 'opaque:lock-two', status: 'UNISSUED' },
    ],
  });
});
afterEach(() => {
  restore?.();
});

async function print(codes = ['ABC123']) {
  const key = idempotencyKey();
  await rawDb.idempotencyRecord.create({
    data: {
      key,
      eventId,
      actorSub: admin.sub,
      endpoint: 'POST /cards/print',
      statusCode: 0,
      responseBody: {},
    },
  });
  return {
    key,
    run: () => printCardBatch({ idempotencyKey: key, shortCodes: codes, format: 'pdf' }, actor),
  };
}
async function waitForLock(pattern: string) {
  await expect
    .poll(
      async () => {
        const rows = await rawDb.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${pattern}`;
        return Number(rows[0]?.count ?? 0);
      },
      { timeout: 3000 },
    )
    .toBeGreaterThan(0);
}
async function holdRow(table: 'Event' | 'EventMembership' | 'MissionCard', id: string) {
  let entered!: (tx: Prisma.TransactionClient) => void;
  const ready = new Promise<Prisma.TransactionClient>((resolve) => {
    entered = resolve;
  });
  const release = deferred();
  const transaction = rawDb.$transaction(
    async (tx) => {
      if (table === 'Event') await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${id} FOR UPDATE`;
      if (table === 'EventMembership')
        await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${id} FOR UPDATE`;
      if (table === 'MissionCard')
        await tx.$queryRaw`SELECT id FROM "MissionCard" WHERE id = ${id} FOR UPDATE`;
      entered(tx);
      await release.promise;
    },
    { timeout: 15_000 },
  );
  return { tx: await ready, release: release.resolve, transaction };
}

it('waits for the event before taking the receipt lock and refuses an archive committed while waiting', async () => {
  const operation = await print();
  const held = await holdRow('Event', eventId);
  const outcome = operation.run().then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  try {
    await waitForLock('%FROM "Event"%FOR SHARE%');
    await rawDb.$transaction(async (tx) => {
      // This would fail immediately if printing took its receipt before the event.
      await tx.$queryRaw`SELECT key FROM "IdempotencyRecord" WHERE key = ${operation.key} FOR UPDATE NOWAIT`;
    });
    await held.tx.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
  } finally {
    held.release();
    await held.transaction;
  }
  expect(await outcome).toMatchObject({ error: { statusCode: 409 } });
  expect(uploads.size).toBe(0);
  expect(await rawDb.cardPrintExport.count()).toBe(0);
});

it.each(['demoted', 'ended'] as const)(
  'rechecks a %s membership under its row lock before reserving or rendering',
  async (change) => {
    const operation = await print();
    const held = await holdRow('EventMembership', actor.membershipId);
    const outcome = operation.run().then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    try {
      await waitForLock('%FROM "EventMembership"%FOR SHARE%');
      await held.tx.eventMembership.update({
        where: { id: actor.membershipId },
        data: change === 'demoted' ? { role: 'VOLUNTEER' } : { status: 'ENDED' },
      });
    } finally {
      held.release();
      await held.transaction;
    }
    expect(await outcome).toMatchObject({ error: { statusCode: 403 } });
    expect(uploads.size).toBe(0);
    expect(await rawDb.auditLog.count({ where: { action: 'card.print' } })).toBe(0);
    expect(
      (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: operation.key } }))
        .statusCode,
    ).toBe(0);
  },
);

it('validates card status after the selected-card lock sees an issue committed while waiting', async () => {
  const card = await rawDb.missionCard.findFirstOrThrow({
    where: { eventId, shortCode: 'ABC123' },
  });
  const operation = await print();
  const held = await holdRow('MissionCard', card.id);
  const outcome = operation.run().then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  try {
    await waitForLock('%FROM "MissionCard"%ORDER BY%FOR UPDATE%');
    await held.tx.missionCard.update({ where: { id: card.id }, data: { status: 'ISSUED' } });
  } finally {
    held.release();
    await held.transaction;
  }
  expect(await outcome).toMatchObject({ error: { statusCode: 409 } });
  expect(uploads.size).toBe(0);
  expect(await rawDb.cardPrintExport.count()).toBe(0);
});

it('holds selected cards, member and event through upload and receipt commit while a real issue waits', async () => {
  await createStation({ code: 'BOOTH' });
  const started = deferred();
  const release = deferred();
  restore?.();
  restore = useCardPrintStorage({
    async write({ key, body }) {
      started.resolve();
      await release.promise;
      uploads.set(key, body);
    },
    async read(key) {
      return uploads.get(key)!;
    },
  });
  const body = { idempotencyKey: idempotencyKey(), shortCodes: ['ABC123'], format: 'pdf' };
  const printing = request(app)
    .post(`/api/v1/events/${eventId}/cards/print`)
    .set('Authorization', bearer(admin))
    .send(body)
    .then((response) => response);
  await started.promise;
  const issuing = request(app)
    .post(`/api/v1/events/${eventId}/cards/ABC123/issue`)
    .set('Authorization', bearer(admin))
    .send({ idempotencyKey: idempotencyKey() })
    .then((response) => response);
  // Start the issue first: a queued event rename must not overtake its event SHARE lock.
  try {
    await waitForLock('%UPDATE%MissionCard%');
  } catch (error) {
    release.resolve();
    await printing;
    await issuing;
    throw error;
  }
  const demotion = rawDb.eventMembership.update({
    where: { id: actor.membershipId },
    data: { role: 'VOLUNTEER' },
  });
  const rename = rawDb.event.update({ where: { id: eventId }, data: { name: 'After the print' } });
  // Prisma promises are lazy; start both updates before observing their locks.
  const mutations = Promise.all([demotion, rename]);
  try {
    await waitForLock('%UPDATE%EventMembership%');
    await waitForLock('%UPDATE%Event%');
    expect(await rawDb.cardPrintExport.count()).toBe(0);
    expect(await rawDb.auditLog.count({ where: { action: 'card.print' } })).toBe(0);
  } finally {
    release.resolve();
  }
  expect((await printing).status).toBe(201);
  expect((await issuing).status).toBe(200);
  await mutations;
  const row = await rawDb.cardPrintExport.findFirstOrThrow({ where: { eventId } });
  expect(row.shortCodes).toEqual(['ABC123']);
  expect(row.printContext).toMatchObject({ eventName: 'Test Event' });
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: body.idempotencyKey } }))
      .statusCode,
  ).toBe(201);
  expect(
    (await rawDb.missionCard.findFirstOrThrow({ where: { eventId, shortCode: 'ABC123' } })).status,
  ).toBe('ISSUED');
});

it('prints concurrent reversed selections in one deterministic card-lock order without a deadlock', async () => {
  const left = await print(['ABC124', 'ABC123']);
  const right = await print(['ABC123', 'ABC124']);
  const results = await Promise.all([left.run(), right.run()]);
  expect(results).toHaveLength(2);
  expect(uploads.size).toBe(2);
  const rows = await rawDb.cardPrintExport.findMany({ where: { eventId } });
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row.shortCodes).toEqual(['ABC123', 'ABC124']);
  expect(await rawDb.auditLog.count({ where: { action: 'card.print' } })).toBe(2);
});
