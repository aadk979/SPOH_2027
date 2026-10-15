import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decodeJwt } from 'jose';
import * as contracts from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { settleDenials } from '../../src/platform/http/authorizationDenials.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, makePlatformAdmin, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';
const app = createApp();
let eventId: string, otherEventId: string, fieldId: string, ownerId: string, ownerToken: string;
async function state() {
  return {
    events: await rawDb.event.findMany({ orderBy: { id: 'asc' } }),
    fields: await rawDb.visitorField.findMany({ orderBy: { id: 'asc' } }),
    values: await rawDb.visitorRecord.findMany({ orderBy: { id: 'asc' } }),
    registrations: await rawDb.registration.findMany({ orderBy: { id: 'asc' } }),
    grants: await rawDb.rolePermission.findMany({ orderBy: { id: 'asc' } }),
    memberships: await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } }),
    receipts: await rawDb.idempotencyRecord.findMany({ orderBy: { key: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
  };
}
beforeEach(async () => {
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  const home = await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
  const owner = await createVolunteer({
    email: 'synthetic-field-owner@example.test',
    role: 'ADMIN',
  });
  ownerId = owner.id;
  await makePlatformAdmin(owner.id);
  const other = await createEvent({
    organisationId: home.organisationId,
    slug: 'synthetic-field-foreign',
    name: 'Synthetic foreign field event',
    timezone: home.timezone,
    status: 'DRAFT',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  otherEventId = other.id;
  await rawDb.event.update({
    where: { id: other.id },
    data: { createdAt: new Date(home.createdAt.getTime() + 1000) },
  });
  await rawDb.eventMembership.create({
    data: { eventId: other.id, personId: owner.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  const opened = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken: owner.token })
    .expect(201);
  ownerToken = opened.body.accessToken as string;
  const response = await request(app)
    .post('/api/v1/events/' + other.id + '/admin/visitor-fields')
    .set('Authorization', 'Bearer ' + ownerToken)
    .send({
      code: 'qa_foreign_field',
      label: 'Synthetic foreign field',
      type: 'text',
      retentionDays: 1,
      readers: ['ADMIN'],
    })
    .expect(201);
  fieldId = contracts.VisitorFieldRecord.parse(response.body.field).id;
});
afterEach(async () => {
  await settleDenials();
  vi.setSystemTime(FROZEN_NOW);
});
const roles = [
  'VOLUNTEER',
  'IC',
  'DEPUTY_COORDINATOR',
  'CHIEF_COORDINATOR',
  'LEAD',
  'ADMIN',
  'FOREIGN',
] as const;
for (const form of ['scoped', 'alias'])
  it.each(roles)(
    `foreign-field ${form} %s cannot modify the actual other event field or its audit history`,
    async (kind) => {
      const foreign = kind === 'FOREIGN',
        role = (foreign ? 'VOLUNTEER' : kind) as contracts.CommitteeRole;
      let personId = ownerId,
        token = ownerToken;
      if (kind !== 'ADMIN') {
        const actor = await createVolunteer({ email: 'synthetic-field-scope@example.test', role });
        personId = actor.id;
        if (foreign)
          await rawDb.eventMembership.updateMany({
            where: { eventId, personId },
            data: { eventId: otherEventId },
          });
        const opened = await request(app)
          .post('/api/v1/auth/session')
          .set('Origin', 'http://localhost:3000')
          .send({ providerAccessToken: actor.token })
          .expect(201);
        token = opened.body.accessToken as string;
      }
      const ownId = foreign ? otherEventId : eventId;
      const own = await request(app)
        .get('/api/v1/events/' + ownId + '/me')
        .set('Authorization', 'Bearer ' + token)
        .expect(200);
      expect(contracts.MeResponse.parse(own.body)).toMatchObject({
        event: { id: ownId },
        volunteer: { id: personId, role },
      });
      const alias = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer ' + token)
        .expect(foreign ? 403 : 200);
      if (foreign) expect(alias.body.error.code).toBe(contracts.ERROR_CODES.NOT_PROVISIONED);
      else expect(contracts.MeResponse.parse(alias.body).event.id).toBe(eventId);
      const actualOther = await request(app)
        .get('/api/v1/events/' + otherEventId + '/admin/visitor-fields')
        .set('Authorization', 'Bearer ' + ownerToken)
        .expect(200);
      expect(
        contracts.collection(contracts.VisitorFieldRecord).parse(actualOther.body).data[0]?.id,
      ).toBe(fieldId);
      const allowed = role === 'CHIEF_COORDINATOR' || role === 'ADMIN';
      const expected = foreign ? (form === 'scoped' ? 404 : 403) : allowed ? 404 : 403;
      const pattern =
        (form === 'scoped' ? '/api/v1/events/:eventId' : '/api/v1') + '/admin/visitor-fields/:id';
      const body = contracts.UpdateVisitorFieldRequest.parse({ label: 'Synthetic refused change' }),
        before = await state();
      const response = await request(app)
        .patch(
          (form === 'scoped' ? '/api/v1/events/' + eventId : '/api/v1') +
            '/admin/visitor-fields/' +
            fieldId,
        )
        .set('Authorization', 'Bearer ' + token)
        .send(body)
        .expect(expected);
      const error = contracts.ErrorBody.parse(response.body).error;
      expect(error.code).toBe(
        foreign
          ? form === 'scoped'
            ? contracts.ERROR_CODES.NOT_FOUND
            : contracts.ERROR_CODES.NOT_PROVISIONED
          : allowed
            ? contracts.ERROR_CODES.NOT_FOUND
            : contracts.ERROR_CODES.FORBIDDEN,
      );
      if (!foreign && !allowed) expect(error.details).toEqual({ actions: ['Structure.Edit'] });
      else expect(error.details).toBeUndefined();
      await settleDenials();
      const after = await state();
      if (!foreign && !allowed) {
        const added = after.audits.filter((row) => !before.audits.some((old) => old.id === row.id));
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({
          action: 'authorization.denied',
          actorId: personId,
          actorSub: decodeJwt(token).sub,
          eventId,
          entityType: 'Route',
          entityId: 'PATCH ' + pattern,
          path: pattern,
          method: 'PATCH',
          statusCode: 403,
          requestId: error.requestId,
          outcome: 'DENIED',
          severity: 'WARNING',
          after: { actions: ['Structure.Edit'] },
        });
        expect({
          ...after,
          audits: after.audits.filter((row) => before.audits.some((old) => old.id === row.id)),
        }).toEqual(before);
      } else expect(after).toEqual(before);
    },
  );
