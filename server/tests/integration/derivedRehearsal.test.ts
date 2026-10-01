import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { IncidentRecord } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { FROZEN_NOW } from '../setup.js';
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
const post = (path: string, body: object) =>
  request(app)
    .post(`/api/v1/events/${eventId}${path}`)
    .set('Authorization', bearer(admin))
    .send(body);
const phase = (status: 'REHEARSAL' | 'LIVE') =>
  rawDb.event.update({ where: { id: eventId }, data: { status } });
const incident = async () => {
  const response = await post('/incidents', {
    type: 'OTHER',
    severity: 'LOW',
    description: 'Derived provenance drill',
    occurredAt: FROZEN_NOW.toISOString(),
    idempotencyKey: idempotencyKey(),
  });
  expect(response.status).toBe(201);
  return response.body.incident.id as string;
};
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'derived@practice.test', role: 'ADMIN' });
});

it.each([true, false])(
  'follow-ups retain their incident mode after phase changes (practice %s)',
  async (rehearsal) => {
    await phase(rehearsal ? 'REHEARSAL' : 'LIVE');
    const id = await incident();
    await phase(rehearsal ? 'LIVE' : 'REHEARSAL');
    const response = await post(`/incidents/${id}/follow-ups`, {
      note: 'Follow-up after mode change',
    });
    expect(response.status).toBe(201);
    expect(IncidentRecord.parse(response.body.incident).followUps[0]?.rehearsal).toBe(rehearsal);
    const status = await post(`/incidents/${id}/status`, {
      status: 'RESOLVED',
      note: 'Resolution after mode change',
    });
    expect(status.status).toBe(200);
    const rows = await rawDb.incidentFollowUp.findMany({ where: { eventId, incidentId: id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.rehearsal === rehearsal)).toBe(true);
    const audits = await rawDb.auditLog.findMany({
      where: {
        eventId,
        entityId: id,
        action: { in: ['incident.followUp', 'incident.statusChange'] },
      },
    });
    expect(audits).toHaveLength(2);
    expect(
      audits.every((row) => (row.after as { rehearsal: boolean }).rehearsal === rehearsal),
    ).toBe(true);
  },
);

it.each([true, false])(
  'acknowledgements retain their alert mode and deduplicate (practice %s)',
  async (rehearsal) => {
    await phase(rehearsal ? 'REHEARSAL' : 'LIVE');
    const raised = await post('/lost-person', {
      descriptionText: 'Derived acknowledgement drill',
      idempotencyKey: idempotencyKey(),
    });
    expect(raised.status).toBe(201);
    const id = raised.body.alert.id as string;
    await phase(rehearsal ? 'LIVE' : 'REHEARSAL');
    const results = await Promise.all([
      post(`/lost-person/${id}/ack`, {}),
      post(`/lost-person/${id}/ack`, {}),
    ]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    expect(await rawDb.lostPersonAck.findMany({ where: { eventId, alertId: id } })).toEqual([
      expect.objectContaining({ rehearsal }),
    ]);
    const audits = await rawDb.auditLog.findMany({
      where: { eventId, entityId: id, action: 'lostPerson.acknowledge' },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.after).toMatchObject({ rehearsal });
  },
);

it('serializes concurrent incident resolutions into one status change and one derived note', async () => {
  await phase('REHEARSAL');
  const id = await incident();
  await phase('LIVE');
  const results = await Promise.all([
    post(`/incidents/${id}/status`, { status: 'RESOLVED', note: 'First responder' }),
    post(`/incidents/${id}/status`, { status: 'RESOLVED', note: 'Second responder' }),
  ]);
  expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(
    await rawDb.incidentFollowUp.count({ where: { eventId, incidentId: id, rehearsal: true } }),
  ).toBe(1);
  expect(
    await rawDb.auditLog.count({
      where: { eventId, entityId: id, action: 'incident.statusChange' },
    }),
  ).toBe(1);
});
