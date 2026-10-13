import { beforeEach, expect, it } from 'vitest';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { generateBatch } from '../../src/modules/missionCard/application/generateBatch.js';
import { issueCard } from '../../src/modules/missionCard/application/issueCard.js';
import { reissueCard } from '../../src/modules/missionCard/application/reissueCard.js';
import { stampCard } from '../../src/modules/missionCard/application/stampCard.js';
import { voidCard } from '../../src/modules/missionCard/application/voidCard.js';
import type { ActorContext } from '../../src/platform/http/auditContext.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createStation, createVolunteer, idempotencyKey, membershipOf, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

let actor: ActorContext;
let stationId: string;
const operations = ['issue', 'stamp', 'void', 'reissue', 'batch'] as const;
type Operation = typeof operations[number];
beforeEach(async () => {
  await resetDatabase();
  const scope = await testEvent();
  const person = await createVolunteer({ email: 'card-authority@test.invalid', role: 'ADMIN' });
  const member = await membershipOf(person.id);
  actor = { scope, volunteerId: person.id, membershipId: member.id,
    audit: { eventId: scope.eventId, actorId: person.id, actorSub: person.sub,
      membershipId: member.id, ip: null, userAgent: null, requestId: null } };
  stationId = (await createStation({ code: 'CURRENT', issuesStamp: true })).id;
  await rawDb.missionCard.createMany({ data: [
    { eventId: scope.eventId, shortCode: 'ABC123', qrPayload: 'authority-original', status: 'ISSUED', issuedAt: FROZEN_NOW },
    { eventId: scope.eventId, shortCode: 'ABC124', qrPayload: 'authority-replacement' },
  ] });
});
async function operation(kind: Operation, key: string) {
  const endpoint = kind === 'batch' ? 'POST /cards/batch' : `POST /cards/:shortCode/${kind === 'stamp' ? 'stamps' : kind}`;
  await rawDb.idempotencyRecord.create({ data: { key, eventId: actor.scope.eventId,
    actorSub: actor.audit.actorSub!, endpoint, statusCode: 0, responseBody: {} } });
  const capture = { scope: actor.scope, actor: { volunteerId: actor.volunteerId, membershipId: actor.membershipId }, audit: actor.audit };
  return { run: () => {
    if (kind === 'issue') return issueCard('ABC124', { idempotencyKey: key }, capture);
    if (kind === 'stamp') return stampCard('ABC123', { stationId, idempotencyKey: key, acknowledgeDuplicate: false }, capture);
    if (kind === 'void') return voidCard('ABC123', { idempotencyKey: key, reason: 'Reviewed correction' }, actor);
    if (kind === 'reissue') return reissueCard('ABC123', { idempotencyKey: key, reason: 'Reviewed correction', replacementShortCode: 'ABC124' }, actor);
    return generateBatch({ idempotencyKey: key, count: 1, batchLabel: 'Authority check', rehearsal: false }, actor);
  } };
}
async function hold(table: 'Person' | 'EventMembership' | 'Event') {
  let ready!: (tx: Prisma.TransactionClient) => void;
  const entered = new Promise<Prisma.TransactionClient>((resolve) => { ready = resolve; });
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const transaction = rawDb.$transaction(async (tx) => {
    if (table === 'Person') await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${actor.volunteerId} FOR UPDATE`;
    if (table === 'EventMembership') await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${actor.membershipId} FOR UPDATE`;
    if (table === 'Event') await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${actor.scope.eventId} FOR UPDATE`;
    ready(tx); await barrier;
  }, { timeout: 15_000 });
  return { tx: await entered, release, transaction };
}
async function wait(pattern: string) {
  await expect.poll(async () => {
    const rows = await rawDb.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${pattern}`;
    return Number(rows[0]?.count ?? 0);
  }, { timeout: 3000 }).toBeGreaterThan(0);
}
it.each(operations)('%s refuses standing committed while waiting before taking its owned receipt', async (kind) => {
  const key = idempotencyKey();
  const mutation = await operation(kind, key);
  const held = await hold('Person');
  const result = mutation.run().then((value) => ({ value }), (error: unknown) => ({ error }));
  try {
    await wait('%FROM "Person"%FOR SHARE%');
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT key FROM "IdempotencyRecord" WHERE key = ${key} FOR UPDATE NOWAIT`;
    });
    await held.tx.person.update({ where: { id: actor.volunteerId }, data: { deactivatedAt: FROZEN_NOW } });
  } finally { held.release(); await held.transaction; }
  expect(await result).toMatchObject({ error: { statusCode: 403 } });
  expect(await rawDb.missionCard.count()).toBe(2);
  expect(await rawDb.cardStampEvent.count()).toBe(0);
  expect(await rawDb.auditLog.count()).toBe(0);
  expect((await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key } })).statusCode).toBe(0);
});
it.each(['void', 'reissue', 'batch'] as const)('%s refuses archive committed before its event lock without settling or writing', async (kind) => {
  const key = idempotencyKey();
  const mutation = await operation(kind, key);
  const held = await hold('Event');
  const result = mutation.run().then((value) => ({ value }), (error: unknown) => ({ error }));
  try {
    await wait('%FROM "Event"%FOR SHARE%');
    await held.tx.event.update({ where: { id: actor.scope.eventId }, data: { status: 'ARCHIVED' } });
  } finally { held.release(); await held.transaction; }
  expect(await result).toMatchObject({ error: { statusCode: 409 } });
  expect(await rawDb.missionCard.count()).toBe(2);
  expect(await rawDb.auditLog.count()).toBe(0);
  expect((await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key } })).statusCode).toBe(0);
});
