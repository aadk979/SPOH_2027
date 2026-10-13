import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ROLE_IDS } from '@spoh/access-policies';
import { beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { assignToStationAllBlocks, bearer, categoryId, createEventDayToday, createStation, createVolunteer, testEvent } from '../helpers/fixtures.js';

const app = createApp();
beforeEach(() => resetDatabase());
it.each(ROLE_IDS)('rechecks the group station independently from card issue authority for %s', async (role) => {
  const { eventId } = await testEvent();
  const day = await createEventDayToday();
  const own = await createStation({ code: 'GROUP-OWN' });
  const other = await createStation({ code: 'GROUP-OTHER' });
  const actor = await createVolunteer({ email: `${role.toLowerCase()}@group-boundary.test`, role });
  await assignToStationAllBlocks({ volunteerId: actor.id, stationId: own.id, eventDayId: day.id });
  const groupId = randomUUID();
  const record = await rawDb.registration.create({ data: { eventId, groupId, stationId: other.id,
    categoryId: await categoryId('SEC_1'), recordedById: actor.id, idempotencyKey: randomUUID() } });
  const card = await rawDb.missionCard.create({ data: { eventId, shortCode: 'GAAA22', qrPayload: 'group-boundary-card' } });
  const response = await request(app).post(`/api/v1/events/${eventId}/cards/${card.shortCode}/issue`)
    .set('Authorization', bearer(actor)).send({ groupId, idempotencyKey: randomUUID() });
  // LEAD retains the approved own-station scope, just like VOLUNTEER.
  const restricted = role === 'VOLUNTEER' || role === 'LEAD';
  expect(response.status).toBe(restricted ? 403 : 200);
  expect((await rawDb.registration.findUniqueOrThrow({ where: { id: record.id } })).missionCardId)
    .toBe(restricted ? null : card.id);
  expect((await rawDb.missionCard.findUniqueOrThrow({ where: { id: card.id } })).status)
    .toBe(restricted ? 'UNISSUED' : 'ISSUED');
});
