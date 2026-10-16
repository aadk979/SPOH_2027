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
import { safetyValidationCases } from '../helpers/p16SafetyValidationCases.js';
const app = createApp();
let eventId: string,
  stationId: string,
  incidentId: string,
  lostPersonId: string,
  admin: TestVolunteer;
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({
    email: 'synthetic-safety-validation@example.test',
    role: 'ADMIN',
  });
  stationId = (await createStation({ code: 'SYNTHETIC_SAFETY_VALIDATION' })).id;
  const membershipId = (await membershipOf(admin.id)).id;
  incidentId = (
    await rawDb.incident.create({
      data: {
        eventId,
        type: 'EQUIPMENT',
        severity: 'LOW',
        description: 'Synthetic controlled validation record: no actual incident or person.',
        stationId,
        reportedById: admin.id,
        reportedByMembershipId: membershipId,
        occurredAt: new Date(),
        idempotencyKey: randomUUID(),
      },
    })
  ).id;
  lostPersonId = (
    await rawDb.lostPersonAlert.create({
      data: {
        eventId,
        descriptionText: 'Synthetic controlled test marker; no actual missing person.',
        lastSeenStationId: stationId,
        raisedById: admin.id,
        raisedByMembershipId: membershipId,
      },
    })
  ).id;
});
async function snapshot() {
  return {
    incidents: await rawDb.incident.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    followUps: await rawDb.incidentFollowUp.findMany({
      where: { eventId },
      orderBy: { id: 'asc' },
    }),
    alerts: await rawDb.lostPersonAlert.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    acknowledgements: await rawDb.lostPersonAck.findMany({
      where: { eventId },
      orderBy: { id: 'asc' },
    }),
    summaries: await rawDb.lostPersonSummary.findMany({
      where: { eventId },
      orderBy: { id: 'asc' },
    }),
    notices: await rawDb.notice.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    receipts: await rawDb.idempotencyRecord.findMany({
      where: { eventId },
      orderBy: { key: 'asc' },
    }),
  };
}
it.each(['scoped', 'alias'])(
  '%s refuses all 165 malformed safety bodies without changing incidents, alerts, notices, audits or receipts',
  async (form) => {
    const corpus = safetyValidationCases({
      stationId,
      incidentId,
      lostPersonId,
      now: new Date().toISOString(),
    });
    expect(corpus.invalid).toHaveLength(165);
    expect(corpus.acceptedShapeControls).toHaveLength(27);
    expect(new Set(corpus.invalid.map((row) => row.id)).size).toBe(165);
    for (const control of corpus.acceptedShapeControls) {
      const schema = contracts[control.schemaName as keyof typeof contracts] as {
        safeParse: (value: unknown) => { success: boolean };
      };
      expect(schema.safeParse(control.body).success, control.id).toBe(true);
    }
    const before = await snapshot();
    for (const row of corpus.invalid) {
      const schema = contracts[row.schemaName as keyof typeof contracts] as {
        safeParse: (value: unknown) => { success: boolean };
      };
      expect(schema.safeParse(row.body).success, row.id).toBe(false);
      const response = await request(app)
        .post((form === 'scoped' ? '/api/v1/events/' + eventId : '/api/v1') + row.path)
        .set('Authorization', bearer(admin))
        .send(row.body);
      expect(response.status, row.id).toBe(400);
      expect(contracts.ErrorBody.parse(response.body).error.code, row.id).toBe('VALIDATION_FAILED');
    }
    expect(await snapshot()).toEqual(before);
    const base = form === 'scoped' ? '/api/v1/events/' + eventId : '/api/v1';
    let createdIncidentId = '',
      createdAlertId = '';
    for (const definition of corpus.definitions) {
      const expected =
        definition.name === 'incident-status' || definition.name === 'lost-person-resolve'
          ? 200
          : 201;
      const response = await request(app)
        .post(base + definition.path)
        .set('Authorization', bearer(admin))
        .send(definition.body);
      expect(response.status, definition.name + ':valid-http-control').toBe(expected);
      if (definition.name.startsWith('incident-')) {
        const record = contracts.IncidentRecord.parse(response.body.incident);
        if (definition.name === 'incident-create') {
          createdIncidentId = record.id;
          expect(record.status).toBe('OPEN');
          expect(record.type).toBe('EQUIPMENT');
          expect(record.description).toBe(definition.body.description);
        } else {
          expect(record.id).toBe(incidentId);
          if (definition.name === 'incident-status') expect(record.status).toBe('ACKNOWLEDGED');
          if (definition.name === 'incident-follow-up')
            expect(record.followUps.some((row) => row.note === definition.body.note)).toBe(true);
        }
      } else {
        const record = contracts.LostPersonAlertRecord.parse(response.body.alert);
        if (definition.name === 'lost-person-raise') {
          createdAlertId = record.id;
          expect(record.status).toBe('ACTIVE');
          expect(record.descriptionText).toBe(definition.body.descriptionText);
        } else {
          expect(record.id).toBe(lostPersonId);
          expect(record.status).toBe('RESOLVED_FOUND');
        }
      }
    }
    expect(createdIncidentId).not.toBe('');
    expect(createdAlertId).not.toBe('');
    for (const id of [incidentId, createdIncidentId]) {
      const response = await request(app)
        .post(base + '/incidents/' + id + '/status')
        .set('Authorization', bearer(admin))
        .send({
          status: 'RESOLVED',
          note: 'Synthetic validation fixture completed; no actual incident.',
        });
      expect(response.status).toBe(200);
      expect(contracts.IncidentRecord.parse(response.body.incident).status).toBe('RESOLVED');
    }
    const resolved = await request(app)
      .post(base + '/lost-person/' + createdAlertId + '/resolve')
      .set('Authorization', bearer(admin))
      .send({
        outcome: 'RESOLVED_FOUND',
        note: 'Synthetic validation fixture completed; no actual missing person.',
      });
    expect(resolved.status).toBe(200);
    expect(contracts.LostPersonAlertRecord.parse(resolved.body.alert).status).toBe(
      'RESOLVED_FOUND',
    );
    expect(await rawDb.incident.count({ where: { eventId, status: { not: 'RESOLVED' } } })).toBe(0);
    expect(await rawDb.lostPersonAlert.count({ where: { eventId, status: 'ACTIVE' } })).toBe(0);
  },
);
