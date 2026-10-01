import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateCardBatchResponse, MissionCardRecord } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import * as idempotency from '../../src/platform/idempotency/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

const app = createApp();
let eventId: string;
let admin: TestVolunteer;
const post = (body: object) =>
  request(app)
    .post(`/api/v1/events/${eventId}/cards/batch`)
    .set('Authorization', bearer(admin))
    .send(body);
const batch = (rehearsal: boolean) => ({
  count: 2,
  batchLabel: 'Print run',
  rehearsal,
  idempotencyKey: idempotencyKey(),
});

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'admin@practice-print.test', role: 'ADMIN' });
});

describe('explicit card batch mode', () => {
  it.each([
    ['READY', false],
    ['READY', true],
    ['REHEARSAL', false],
    ['LIVE', true],
  ] as const)('prints the chosen mode in %s (practice %s)', async (status, rehearsal) => {
    await rawDb.event.update({ where: { id: eventId }, data: { status } });
    const response = await post(batch(rehearsal));
    expect(response.status).toBe(201);
    const printed = GenerateCardBatchResponse.parse(response.body);
    expect(printed.rehearsal).toBe(rehearsal);
    expect(
      printed.csv
        .split('\n')
        .slice(1)
        .every((row) => row.endsWith(rehearsal ? ',REHEARSAL' : ',LIVE')),
    ).toBe(true);
    const cards = await rawDb.missionCard.findMany({ where: { eventId } });
    expect(cards).toHaveLength(2);
    expect(cards.every((card) => card.rehearsal === rehearsal && card.status === 'UNISSUED')).toBe(
      true,
    );
    const audit = await rawDb.auditLog.findFirstOrThrow({
      where: { eventId, action: 'card.batch' },
    });
    expect(audit.after).toMatchObject({ rehearsal, created: 2 });
    const lookup = await request(app)
      .get(`/api/v1/events/${eventId}/cards/${cards[0]!.shortCode}`)
      .set('Authorization', bearer(admin));
    expect(lookup.status).toBe(200);
    expect(MissionCardRecord.parse(lookup.body.card).rehearsal).toBe(rehearsal);
  });

  it('refuses replay in another event administered by the same person', async () => {
    const source = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
    const other = await createEvent({
      organisationId: source.organisationId,
      slug: 'other-print',
      name: 'Other',
      timezone: 'UTC',
      categories: [],
      stationTypes: [],
      shiftTemplates: [],
    });
    await rawDb.eventMembership.create({
      data: { eventId: other.id, personId: admin.id, role: 'ADMIN' },
    });
    const input = batch(true);
    expect((await post(input)).status).toBe(201);
    const response = await request(app)
      .post(`/api/v1/events/${other.id}/cards/batch`)
      .set('Authorization', bearer(admin))
      .send(input);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    expect(response.body.csv).toBeUndefined();
    expect(await rawDb.missionCard.count({ where: { eventId: other.id } })).toBe(0);
    const fresh = await request(app)
      .post(`/api/v1/events/${other.id}/cards/batch`)
      .set('Authorization', bearer(admin))
      .send(batch(false));
    expect(fresh.status).toBe(201);
    expect(await rawDb.missionCard.count({ where: { eventId: other.id, rehearsal: false } })).toBe(
      2,
    );
  });

  it('requires an explicit mode and retry key before minting cards', async () => {
    const input = batch(false);
    expect(
      (
        await post({
          count: input.count,
          batchLabel: input.batchLabel,
          idempotencyKey: input.idempotencyKey,
        })
      ).status,
    ).toBe(400);
    expect(
      (await post({ count: input.count, batchLabel: input.batchLabel, rehearsal: false })).status,
    ).toBe(400);
    expect(await rawDb.missionCard.count({ where: { eventId } })).toBe(0);
  });

  it('keeps an abandoned-key takeover from racing an in-flight print transaction', async () => {
    const key = idempotencyKey();
    const createdAt = new Date(Date.now() - 300_000);
    await rawDb.idempotencyRecord.create({
      data: {
        key,
        eventId,
        endpoint: 'POST /cards/batch',
        actorSub: admin.sub,
        statusCode: 0,
        responseBody: {},
        createdAt,
      },
    });
    await rawDb.$transaction(async (tx) => {
      await idempotency.lockReserved(tx, { eventId }, key);
      await expect(
        rawDb.$transaction(async (other) => {
          await other.$executeRawUnsafe("SET LOCAL lock_timeout = '100ms'");
          await other.idempotencyRecord.updateMany({
            where: { key, eventId, statusCode: 0, createdAt },
            data: { createdAt: new Date() },
          });
        }),
      ).rejects.toThrow(/lock timeout/);
    });
  });

  it('preserves a replay if the response bookkeeping fails after the cards commit', async () => {
    const input = batch(true);
    let completedBeforeResponse = false;
    const settle = vi.spyOn(idempotency, 'settle').mockImplementation(async () => {
      const row = await rawDb.idempotencyRecord.findUniqueOrThrow({
        where: { key: input.idempotencyKey },
      });
      completedBeforeResponse =
        row.statusCode === 201 && Object.hasOwn(row.responseBody as object, 'csv');
      throw new Error('Simulated response bookkeeping failure');
    });
    try {
      const first = await post(input);
      expect(first.status).toBe(201);
      expect(completedBeforeResponse).toBe(true);
      expect((await post(input)).body).toEqual(first.body);
      expect(await rawDb.missionCard.count({ where: { eventId } })).toBe(2);
      expect(await rawDb.auditLog.count({ where: { eventId, action: 'card.batch' } })).toBe(1);
    } finally {
      settle.mockRestore();
    }
  });

  it('replays the original print run after go-live without minting another batch', async () => {
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'REHEARSAL' } });
    const input = batch(true);
    const first = await post(input);
    expect(first.status).toBe(201);
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
    const retry = await post(input);
    expect(retry.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    expect(await rawDb.missionCard.count({ where: { eventId, rehearsal: true } })).toBe(2);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'card.batch' } })).toBe(1);
  });
});
