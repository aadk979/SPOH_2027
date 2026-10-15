import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { captureValidationCases } from '../helpers/captureValidationCases.js';

const app = createApp();
let admin: TestVolunteer, eventId: string, stationId: string, giftTypeId: string;
const cardShortCode = 'A2B3C4';
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({
    email: 'synthetic-capture-validation@example.test',
    role: 'ADMIN',
  });
  const station = await createStation({
    code: 'SYNTHETIC_VALIDATION',
    countsEntry: true,
    issuesStamp: true,
  });
  stationId = station.id;
  const day = await createEventDayToday();
  await assignToStationAllBlocks({ volunteerId: admin.id, stationId, eventDayId: day.id });
  giftTypeId = (
    await rawDb.giftType.create({
      data: { eventId, name: 'Synthetic validation gift', initialStock: 100 },
    })
  ).id;
  await rawDb.missionCard.create({
    data: { eventId, shortCode: cardShortCode, qrPayload: randomUUID(), status: 'UNISSUED' },
  });
});
afterEach(() => vi.restoreAllMocks());

it('refuses the same 185 malformed capture requests observed on staging without creating business records', async () => {
  const cases = captureValidationCases({ stationId, category: 'SEC_1', giftTypeId, cardShortCode });
  expect(cases).toHaveLength(185);
  expect(new Set(cases.map((row) => row.id)).size).toBe(185);
  for (const row of cases) {
    const response = await request(app)
      .post('/api/v1/events/' + eventId + row.path)
      .set('Authorization', bearer(admin))
      .send(row.body);
    expect(response.status, row.id).toBe(row.expectedStatus);
    expect(response.body.error.code, row.id).toBe('VALIDATION_FAILED');
  }
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
  expect(await rawDb.footfallTick.count({ where: { eventId } })).toBe(0);
  expect(await rawDb.cardStampEvent.count({ where: { eventId } })).toBe(0);
  expect(await rawDb.giftRedemption.count({ where: { eventId } })).toBe(0);
  expect(await rawDb.missionCard.findFirst({ where: { eventId } })).toMatchObject({
    status: 'UNISSUED',
  });
  expect(await rawDb.giftType.findUnique({ where: { id: giftTypeId } })).toMatchObject({
    initialStock: 100,
  });
  expect(
    await rawDb.auditLog.count({
      where: {
        eventId,
        action: {
          in: [
            'registration.create',
            'registration.createGroup',
            'footfall.tick',
            'footfall.bulk',
            'card.issue',
            'card.stamp',
            'gift.redeem',
            'gift.adjust',
          ],
        },
      },
    }),
  ).toBe(0);
});
