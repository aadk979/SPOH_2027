import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { IncidentRecord, LostFoundRecord, LostPersonAlertRecord } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let eventId: string;
let admin: TestVolunteer;
const post = (path: string, body: object) =>
  request(app)
    .post(`/api/v1/events/${eventId}${path}`)
    .set('Authorization', bearer(admin))
    .send(body);
const get = (path: string) =>
  request(app).get(`/api/v1/events/${eventId}${path}`).set('Authorization', bearer(admin));
const phase = (status: 'REHEARSAL' | 'READY' | 'LIVE' | 'CLOSED') =>
  rawDb.event.update({ where: { id: eventId }, data: { status } });
const raise = () =>
  post('/lost-person', {
    descriptionText: 'Practice search description',
    idempotencyKey: idempotencyKey(),
  });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'admin@practice-safety.test', role: 'ADMIN' });
  await phase('REHEARSAL');
});

describe('safety practice provenance', () => {
  it('labels alerts and keeps a practice alert out of active LIVE polls', async () => {
    const raised = await raise();
    expect(raised.status).toBe(201);
    expect(LostPersonAlertRecord.parse(raised.body.alert).rehearsal).toBe(true);
    expect((await get('/lost-person/active')).body.alerts).toHaveLength(1);
    await phase('LIVE');
    expect((await get('/lost-person/active')).body.alerts).toHaveLength(0);
    const live = await raise();
    expect(live.status).toBe(201);
    expect(live.body.alert.rehearsal).toBe(false);
    expect(
      (await get('/lost-person/active')).body.alerts.map((alert: { id: string }) => alert.id),
    ).toEqual([live.body.alert.id]);
    expect(await rawDb.lostPersonAlert.count({ where: { eventId, rehearsal: true } })).toBe(1);
  });

  it.each(['READY', 'CLOSED'] as const)(
    'removes practice interruptions in %s without hiding a real search',
    async (status) => {
      await phase('LIVE');
      const live = await raise();
      await phase('REHEARSAL');
      const practice = await raise();
      expect((await get('/lost-person/active')).body.alerts).toHaveLength(2);
      await phase(status);
      const active = await get('/lost-person/active');
      expect(active.status).toBe(200);
      expect(active.body.alerts.map((alert: { id: string }) => alert.id)).toEqual([
        live.body.alert.id,
      ]);
      const resolved = await post(`/lost-person/${practice.body.alert.id}/resolve`, {
        outcome: 'RESOLVED_FOUND',
      });
      expect(resolved.status).toBe(200);
      expect(resolved.body.alert).toMatchObject({ rehearsal: true, status: 'RESOLVED_FOUND' });
      const audit = await rawDb.auditLog.findFirstOrThrow({
        where: { eventId, action: 'lostPerson.resolve', entityId: practice.body.alert.id },
      });
      expect(audit.after).toMatchObject({ rehearsal: true });
    },
  );

  it('writes one resolution audit when two responders close the same practice alert', async () => {
    const raised = await raise();
    await phase('LIVE');
    const path = `/lost-person/${raised.body.alert.id}/resolve`;
    const results = await Promise.all([
      post(path, { outcome: 'RESOLVED_FOUND' }),
      post(path, { outcome: 'RESOLVED_OTHER' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(
      await rawDb.auditLog.count({
        where: { eventId, action: 'lostPerson.resolve', entityId: raised.body.alert.id },
      }),
    ).toBe(1);
    expect((await rawDb.lostPersonAlert.findFirstOrThrow({ where: { eventId } })).rehearsal).toBe(
      true,
    );
  });

  it('retains safety record labels in historical reads after go-live', async () => {
    const reported = await post('/incidents', {
      type: 'OTHER',
      severity: 'HIGH',
      description: 'Practice incident at the desk',
      occurredAt: FROZEN_NOW.toISOString(),
      idempotencyKey: idempotencyKey(),
    });
    const found = await post('/lost-found', { itemLabel: 'Practice bottle' });
    expect(reported.status).toBe(201);
    expect(found.status).toBe(201);
    expect(IncidentRecord.parse(reported.body.incident).rehearsal).toBe(true);
    expect(LostFoundRecord.parse(found.body.item).rehearsal).toBe(true);
    await phase('LIVE');
    expect((await get('/incidents')).body.data[0]).toMatchObject({
      id: reported.body.incident.id,
      rehearsal: true,
    });
    expect((await get('/lost-found')).body.data[0]).toMatchObject({
      id: found.body.item.id,
      rehearsal: true,
    });
    const claim = await post(`/lost-found/${found.body.item.id}/claim`, {});
    expect(claim.status).toBe(200);
    expect(claim.body.item).toMatchObject({ rehearsal: true, status: 'CLAIMED' });
  });
});
