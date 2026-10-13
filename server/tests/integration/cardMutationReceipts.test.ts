import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import * as idempotency from '../../src/platform/idempotency/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createStation, createVolunteer, idempotencyKey, testEvent,
  type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let eventId: string;
let admin: TestVolunteer;
let stationId: string;
const kinds = ['issue', 'stamps', 'void', 'reissue'] as const;
type Kind = typeof kinds[number];
const action = (kind: Kind) => kind === 'stamps' ? 'card.stamp' : `card.${kind}`;
const post = (kind: Kind, body: object, code = 'ABC123', actor = admin) => request(app)
  .post(`/api/v1/events/${eventId}/cards/${code}/${kind}`)
  .set('Authorization', bearer(actor)).send(body);
const bodyFor = (kind: Kind, key = idempotencyKey()) => ({ idempotencyKey: key,
  ...(kind === 'stamps' ? { stationId } : {}),
  ...(['void', 'reissue'].includes(kind) ? { reason: 'Reviewed lost or damaged physical card' } : {}),
  ...(kind === 'reissue' ? { replacementShortCode: 'ABC124' } : {}),
});
async function prepare(kind: Kind) {
  if (kind === 'reissue') expect((await post('stamps', bodyFor('stamps'))).status).toBe(201);
}
async function effects(kind: Kind) {
  return { audits: await rawDb.auditLog.count({ where: { eventId, action: action(kind) } }),
    stamps: await rawDb.cardStampEvent.count({ where: { eventId } }),
    cards: await rawDb.missionCard.findMany({ where: { eventId }, orderBy: { shortCode: 'asc' },
      select: { id: true, status: true, issuedAt: true, completedAt: true, voidedAt: true, reissuedFromId: true } }) };
}
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'card-receipt@test.invalid', role: 'ADMIN' });
  stationId = (await createStation({ code: 'RECEIPT', name: 'Private old station label', issuesStamp: true })).id;
  await createStation({ code: 'REMAINING', issuesStamp: true });
  await rawDb.missionCard.createMany({ data: ['ABC123', 'ABC124', 'ABC125'].map((shortCode) => ({
    eventId, shortCode, qrPayload: `opaque:receipt-${shortCode}`, status: 'UNISSUED',
  })) });
});
afterEach(() => vi.restoreAllMocks());

it.each(kinds)('%s commits only a versioned minimal receipt and replays through archived phase without new effects', async (kind) => {
  await prepare(kind);
  const body = bodyFor(kind);
  const first = await post(kind, body);
  expect(first.status).toBe(['stamps', 'reissue'].includes(kind) ? 201 : 200);
  const receipt = await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: body.idempotencyKey } });
  expect(receipt.statusCode).toBe(first.status);
  expect(receipt.responseBody).toMatchObject({ version: 1, kind: kind === 'stamps' ? 'STAMP' : kind.toUpperCase(),
    cardId: first.body.card.id, shortCode: first.body.card.shortCode });
  expect(JSON.stringify(receipt.responseBody)).not.toMatch(/Private old station label|card-receipt@test|Reviewed lost|recordedByName|stamps"|reason"/);
  const before = await effects(kind);
  await rawDb.station.update({ where: { id: stationId }, data: { name: 'Current label after rename' } });
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED', closedAt: FROZEN_NOW } });
  const replay = await post(kind, body);
  expect(replay.status).toBe(first.status);
  expect(replay.body.card.id).toBe(first.body.card.id);
  if (replay.body.card.stamps.length) expect(replay.body.card.stamps[0].stationName).toBe('Current label after rename');
  if (kind === 'stamps') expect(replay.body).toMatchObject({ stampAdded: true, justCompleted: false, warning: null });
  if (kind === 'reissue') expect(replay.body).toMatchObject({ voidedCardId: first.body.voidedCardId, stampsCarriedOver: 1 });
  expect(await effects(kind)).toEqual(before);
});

it.each(kinds)('%s rolls card writes, stamp copies and audit back when transactional receipt settlement fails', async (kind) => {
  await prepare(kind);
  const body = bodyFor(kind);
  const before = await effects(kind);
  vi.spyOn(idempotency, 'settleReserved').mockRejectedValueOnce(new Error('receipt storage unavailable'));
  expect((await post(kind, body)).status).toBe(500);
  expect(await effects(kind)).toEqual(before);
  expect(await rawDb.idempotencyRecord.count({ where: { key: body.idempotencyKey, statusCode: { gt: 0 } } })).toBe(0);
  vi.restoreAllMocks();
  expect((await post(kind, body)).status).toBe(['stamps', 'reissue'].includes(kind) ? 201 : 200);
  expect(await rawDb.auditLog.count({ where: { eventId, action: action(kind) } })).toBe(before.audits + 1);
});

it.each(kinds)('%s survives middleware settlement failure after the committed effect with one effect on retry', async (kind) => {
  await prepare(kind);
  const body = bodyFor(kind);
  vi.spyOn(idempotency, 'settle').mockRejectedValueOnce(new Error('late middleware write failed'));
  const first = await post(kind, body);
  expect(first.status).toBe(['stamps', 'reissue'].includes(kind) ? 201 : 200);
  const committed = await effects(kind);
  vi.restoreAllMocks();
  expect((await post(kind, body)).body).toEqual(first.body);
  expect(await effects(kind)).toEqual(committed);
});

it('settles no-op issue and duplicate stamp outcomes and hydrates a renamed station and erased prior recorder', async () => {
  const recorder = await createVolunteer({ email: 'old-recorder@test.invalid', role: 'ADMIN', displayName: 'Original personal name' });
  expect((await post('stamps', bodyFor('stamps'), 'ABC123', recorder)).status).toBe(201);
  const issueBody = bodyFor('issue');
  expect((await post('issue', issueBody)).status).toBe(200);
  const duplicateBody = bodyFor('stamps');
  const duplicate = await post('stamps', duplicateBody);
  expect(duplicate.status).toBe(200);
  expect(duplicate.body).toMatchObject({ stampAdded: false, justCompleted: false });
  expect((await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: duplicateBody.idempotencyKey } })).responseBody)
    .toMatchObject({ kind: 'STAMP', warningKind: 'ALREADY_STAMPED', stampAdded: false, justCompleted: false });
  await rawDb.person.update({ where: { id: recorder.id }, data: { displayName: '[Erased]', piiErasedAt: FROZEN_NOW } });
  await rawDb.station.update({ where: { id: stationId }, data: { name: 'Current stamp desk' } });
  await rawDb.missionCard.updateMany({ where: { eventId, shortCode: 'ABC123' }, data: { status: 'COMPLETED', completedAt: FROZEN_NOW } });
  const replay = await post('stamps', duplicateBody);
  expect(replay.body).toMatchObject({ stampAdded: false, justCompleted: false,
    warning: 'This card was already stamped at Current stamp desk.', card: { status: 'COMPLETED',
      stamps: [expect.objectContaining({ recordedByName: '[Erased]', stationName: 'Current stamp desk' })] } });
  expect((await post('issue', issueBody)).body.card.status).toBe('COMPLETED');
  expect(await rawDb.cardStampEvent.count()).toBe(1);
  expect(await rawDb.auditLog.count({ where: { action: 'card.issue' } })).toBe(0);
});

it.each(['issue', 'stamps'] as const)('hydrates historical full %s receipts without retaining old recorder names on replay', async (kind) => {
  const body = bodyFor(kind);
  const first = await post(kind, body);
  await rawDb.idempotencyRecord.update({ where: { key: body.idempotencyKey },
    data: { requestHash: null, responseBody: first.body } });
  const before = await effects(kind);
  await rawDb.person.update({ where: { id: admin.id }, data: { displayName: 'Current roster name' } });
  await rawDb.station.update({ where: { id: stationId }, data: { name: 'Current legacy label' } });
  const replay = await post(kind, body);
  expect(replay.status).toBe(first.status);
  if (kind === 'stamps') expect(replay.body.card.stamps[0]).toMatchObject({ recordedByName: 'Current roster name', stationName: 'Current legacy label' });
  expect(await effects(kind)).toEqual(before);
});

it.each(['void', 'reissue'] as const)('requires a correction UUID before reserving a %s intent', async (kind) => {
  const { idempotencyKey: _key, ...withoutKey } = bodyFor(kind);
  expect((await post(kind, withoutKey)).status).toBe(400);
  expect((await post(kind, { ...withoutKey, idempotencyKey: 'not-a-uuid' })).status).toBe(400);
  expect(await rawDb.idempotencyRecord.count()).toBe(0);
  expect(await rawDb.auditLog.count({ where: { action: action(kind) } })).toBe(0);
});

it('rejects a historical completed key against a different card rather than hydrating an unrelated journey', async () => {
  const body = bodyFor('issue');
  expect((await post('issue', body)).status).toBe(200);
  await rawDb.idempotencyRecord.update({ where: { key: body.idempotencyKey }, data: { requestHash: null } });
  const response = await post('issue', body, 'ABC125');
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSE');
  expect((await rawDb.missionCard.findFirstOrThrow({ where: { eventId, shortCode: 'ABC125' } })).status).toBe('UNISSUED');
});

it('serializes simultaneous reissues of one original into one replacement journey and one refusal', async () => {
  await prepare('reissue');
  const responses = await Promise.all(['ABC124', 'ABC125'].map((replacementShortCode) => post('reissue', {
    ...bodyFor('reissue'), replacementShortCode,
  })));
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  const original = await rawDb.missionCard.findFirstOrThrow({ where: { eventId, shortCode: 'ABC123' } });
  expect(original.status).toBe('LOST');
  expect(await rawDb.missionCard.count({ where: { eventId, reissuedFromId: original.id } })).toBe(1);
  expect(await rawDb.cardStampEvent.count()).toBe(2);
  expect(await rawDb.auditLog.count({ where: { action: 'card.reissue' } })).toBe(1);
  expect(await rawDb.idempotencyRecord.count({ where: { endpoint: 'POST /cards/:shortCode/reissue', statusCode: 201 } })).toBe(1);
});
