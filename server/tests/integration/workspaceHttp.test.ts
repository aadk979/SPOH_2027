import { withCurrentRead } from '../../src/platform/access/transactionRead.js';
import request from 'supertest';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EntityResponse, RecordsResponse, SearchResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { useAuthorizer } from '../../src/platform/access/engine.js';
import { LocalCedarAuthorizer } from '../../src/platform/access/authorizer/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createStation, createVolunteer, idempotencyKey, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';
const app = createApp();
let eventId: string;
let stationId: string;
let chief: TestVolunteer;
let volunteer: TestVolunteer;
beforeEach(async () => {
  useAuthorizer(null);
  await resetDatabase();
  eventId = (await testEvent()).eventId;
  chief = await createVolunteer({ email: 'workspace-http-chief@example.test', role: 'CHIEF_COORDINATOR' });
  volunteer = await createVolunteer({ email: 'workspace-http-volunteer@example.test', role: 'VOLUNTEER' });
  stationId = (await createStation({ code: 'HTTP_STATION', countsEntry: true })).id;
  await rawDb.footfallTick.create({ data: { eventId, stationId, recordedById: chief.id, quantity: 7,
    source: 'PAPER', recordedAt: FROZEN_NOW, idempotencyKey: idempotencyKey() } });
});
afterEach(() => useAuthorizer(null));
const get = (path: string, query: object, actor = chief) => request(app).get(`/api/v1/events/${eventId}/workspace/${path}`)
  .set('Authorization', bearer(actor)).query(query);
it('serves the typed composite reads with exact totals and private cache headers', async () => {
  const entity = await get('entity', { kind: 'station', id: stationId });
  expect(entity.status).toBe(200);
  expect(EntityResponse.parse(entity.body).ref).toEqual({ kind: 'station', id: stationId });
  expect(entity.headers['cache-control']).toBe('private, no-store');
  const records = await get('records', { kind: 'footfall', stationId, rehearsal: 'false', limit: '1', asOf: FROZEN_NOW.toISOString() });
  expect(records.status).toBe(200);
  expect(RecordsResponse.parse(records.body)).toMatchObject({ filter: { kind: 'footfall', stationId, rehearsal: false },
    aggregate: { value: 7, unit: 'roomEntries' }, meta: { count: 1, nextCursor: null } });
  const search = await get('search', { query: 'HTTP_STATION' });
  expect(search.status).toBe(200);
  expect(SearchResponse.parse(search.body).data.some((row) => row.destination.kind === 'station' && row.destination.id === stationId)).toBe(true);
});
it('keeps station references separate from dashboard counts and rechecks current standing', async () => {
  expect((await get('entity', { kind: 'station', id: stationId }, volunteer)).status).toBe(200);
  expect((await get('records', { kind: 'footfall', stationId }, volunteer)).status).toBe(403);
  await rawDb.eventMembership.updateMany({ where: { eventId, personId: chief.id }, data: { status: 'DEACTIVATED' } });
  expect((await get('entity', { kind: 'station', id: stationId })).status).toBe(403);
});
it('rejects unknown kinds, repeated filters and unsupported predicates before reading data', async () => {
  for (const query of [{ kind: 'unsupported', id: stationId }, { kind: 'station', id: stationId, via: 'assignment' }])
    expect((await get('entity', query)).status).toBe(400);
  for (const query of [{ kind: 'footfall', rehearsal: 'yes' }, { kind: 'footfall', stationId: [stationId, 'another'] },
    { kind: 'footfall', unimplemented: 'true' }, { kind: 'people', source: 'APP' }])
    expect((await get('records', query)).status).toBe(400);
  expect((await request(app).get(`/api/v1/events/${eventId}/workspace/search`).query({ query: 'Station' })).status).toBe(401);
});
it('propagates an unavailable source policy as 503 without a successful empty search', async () => {
  const cedar = new LocalCedarAuthorizer();
  useAuthorizer({ batch: (questions) => cedar.batch(questions), isAuthorized: async (question) => {
    const decision = await cedar.isAuthorized(question);
    return question.action === 'Self.Read' ? { ...decision, allowed: true, errors: ['Policy evaluation failed'] } : decision;
  } });
  expect((await get('search', { query: 'HTTP_STATION' })).status).toBe(503);
  expect((await get('entity', { kind: 'station', id: stationId })).status).toBe(503);
});

it('keeps one count/row snapshot when another connection commits a backdated capture during the read', async () => {
  const membership = await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: chief.id } });
  const input = { scope: { eventId }, personId: chief.id, membershipId: membership.id, now: FROZEN_NOW };
  const where = { eventId, stationId, recordedAt: { lte: FROZEN_NOW } };
  const snapshot = await withCurrentRead(input, async (context) => {
    const totals = await context.db.footfallTick.aggregate({ where, _sum: { quantity: true }, _count: true });
    await rawDb.footfallTick.create({ data: { eventId, stationId, recordedById: chief.id, quantity: 5,
      source: 'PAPER', recordedAt: FROZEN_NOW, idempotencyKey: idempotencyKey() } });
    const rows = await context.db.footfallTick.findMany({ where, select: { quantity: true } });
    return { totals, rows };
  });
  expect(snapshot.totals._count).toBe(1);
  expect(snapshot.totals._sum.quantity).toBe(7);
  expect(snapshot.rows).toHaveLength(1);
  expect(snapshot.rows.reduce((total, row) => total + row.quantity, 0)).toBe(snapshot.totals._sum.quantity);
  const next = await withCurrentRead(input, (context) => context.db.footfallTick.aggregate({ where, _sum: { quantity: true }, _count: true }));
  expect(next._count).toBe(2);
  expect(next._sum.quantity).toBe(12);
});
