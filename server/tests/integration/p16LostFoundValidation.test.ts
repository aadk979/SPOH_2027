import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import * as contracts from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createStation,
  createVolunteer,
  membershipOf,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { lostFoundValidationCases } from '../helpers/p16LostFoundValidationCases.js';
const app = createApp();
let eventId: string, stationId: string, itemId: string, admin: TestVolunteer;
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({
    email: 'synthetic-lost-found-validation@example.test',
    role: 'ADMIN',
  });
  stationId = (await createStation({ code: 'SYNTHETIC_LOST_FOUND_VALIDATION' })).id;
  const membershipId = (await membershipOf(admin.id)).id;
  itemId = (
    await rawDb.lostFoundItem.create({
      data: {
        eventId,
        itemLabel: 'Synthetic controlled seed bottle ' + randomUUID(),
        foundStationId: stationId,
        foundAt: new Date(),
        loggedById: admin.id,
        loggedByMembershipId: membershipId,
      },
    })
  ).id;
});
async function snapshot() {
  return {
    items: await rawDb.lostFoundItem.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    receipts: await rawDb.idempotencyRecord.findMany({
      where: { eventId },
      orderBy: { key: 'asc' },
    }),
  };
}
it.each(['scoped', 'alias'] as const)(
  '%s lost-and-found validates field and query shapes, preserves refused state and accepts real log/claim controls',
  async (form) => {
    const corpus = lostFoundValidationCases({ stationId, itemId, now: new Date().toISOString() }),
      base = form === 'scoped' ? '/api/v1/events/' + eventId : '/api/v1';
    expect(corpus.malformedQueries).toHaveLength(12);
    expect(corpus.invalid.length).toBeGreaterThan(0);
    for (const row of corpus.acceptedShapeControls) {
      const schema = contracts[row.schemaName as keyof typeof contracts] as {
        safeParse: (body: unknown) => { success: boolean };
      };
      expect(schema.safeParse(row.body).success, row.id).toBe(true);
    }
    const before = await snapshot();
    for (const row of corpus.invalid) {
      const response = await request(app)
        .post(base + row.path)
        .set('Authorization', bearer(admin))
        .send(row.body);
      expect(response.status, row.id).toBe(400);
      expect(contracts.ErrorBody.parse(response.body).error.code, row.id).toBe('VALIDATION_FAILED');
    }
    for (const [index, input] of corpus.malformedQueries.entries()) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(input))
        for (const element of Array.isArray(value) ? value : [value]) query.append(key, element);
      const response = await request(app)
        .get(base + '/lost-found?' + query)
        .set('Authorization', bearer(admin));
      expect(response.status, 'query:' + index).toBe(400);
      expect(contracts.ErrorBody.parse(response.body).error.code).toBe('VALIDATION_FAILED');
    }
    expect(await snapshot()).toEqual(before);
    let createdId = '';
    for (const row of corpus.definitions) {
      const response = await request(app)
        .post(base + row.path)
        .set('Authorization', bearer(admin))
        .send(row.body);
      expect(response.status, row.name).toBe(row.expectedStatus);
      const record = contracts.LostFoundRecord.parse(response.body.item);
      if (row.name === 'lost-found-log') {
        createdId = record.id;
        expect(record.itemLabel).toBe(row.body.itemLabel);
        expect(record.status).toBe('HELD');
        expect(record.photoKey).toBeNull();
        expect(record.loggedById).toBe(admin.id);
      } else {
        expect(record.id).toBe(itemId);
        expect(record.status).toBe('CLAIMED');
        expect(record.holderNote).toBe(row.body.note);
      }
    }
    expect(createdId).not.toBe('');
    const cleanup = await request(app)
      .post(base + '/lost-found/' + createdId + '/claim')
      .set('Authorization', bearer(admin))
      .send({ note: 'Synthetic fixture completed; no actual claimant.' });
    expect(cleanup.status).toBe(200);
    expect(contracts.LostFoundRecord.parse(cleanup.body.item).status).toBe('CLAIMED');
    const list = await request(app)
      .get(base + '/lost-found?status=CLAIMED&q=synthetic&limit=200')
      .set('Authorization', bearer(admin));
    expect(list.status).toBe(200);
    expect(list.body.meta).toEqual({ count: 2, nextCursor: null });
    expect(
      list.body.data.map((row: unknown) => contracts.LostFoundRecord.parse(row).id).sort(),
    ).toEqual([itemId, createdId].sort());
    expect(await rawDb.lostFoundItem.count({ where: { eventId, status: 'HELD' } })).toBe(0);
  },
);
