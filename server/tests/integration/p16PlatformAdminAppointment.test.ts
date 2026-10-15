// Private regression for ADR-005 §3 / approved C5. No application change yet.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { decodeJwt } from 'jose';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as contracts from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { identityProvider } from '../../src/platform/identity/index.js';
import { settleDenials } from '../../src/platform/http/authorizationDenials.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  createVolunteer,
  makePlatformAdmin,
  renewFixtureToken,
  testEvent,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';
const app = createApp();
const targets = (['scoped', 'alias'] as const).flatMap((form) =>
  (['provision', 'import'] as const).map((operation) => ({ form, operation })),
);
const appointmentBody = (operation: 'provision' | 'import', row: Record<string, unknown>) =>
  operation === 'provision' ? row : { commit: true, rows: [row] };
let eventId: string,
  otherEventId: string,
  operatorId: string,
  operatorEmail: string,
  operatorToken: string;
let targetId: string, targetEmail: string, targetToken: string, ordinaryToken: string;
const profile = (id: string) =>
  rawDb.person.findUniqueOrThrow({
    where: { id },
    select: {
      email: true,
      displayName: true,
      phone: true,
      cognitoSub: true,
      deactivatedAt: true,
      piiErasedAt: true,
    },
  });
const path = (form: string, suffix: string) =>
  (form === 'scoped' ? '/api/v1/events/' + otherEventId : '/api/v1') + suffix;
async function open(providerAccessToken: string): Promise<string> {
  const result = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken })
    .expect(201);
  return result.body.accessToken as string;
}
beforeEach(async () => {
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
  const home = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const other = await createEvent({
    organisationId: home.organisationId,
    slug: 'synthetic-admin-appointment',
    name: 'Synthetic administrator appointment',
    timezone: home.timezone,
    status: 'DRAFT',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  otherEventId = other.id;
  const operator = await createVolunteer({
    email: 'synthetic-platform-appointment@example.test',
    role: 'ADMIN',
  });
  operatorId = operator.id;
  operatorEmail = operator.email;
  await makePlatformAdmin(operator.id);
  await rawDb.eventMembership.create({
    data: { eventId: other.id, personId: operator.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  operatorToken = await open(operator.token);
  const ordinary = await createVolunteer({
    email: 'synthetic-ordinary-appointment@example.test',
    role: 'ADMIN',
  });
  await rawDb.eventMembership.create({
    data: { eventId: other.id, personId: ordinary.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  ordinaryToken = await open(ordinary.token);
  const ordinaryStanding = await request(app)
    .get('/api/v1/events/' + other.id + '/permissions')
    .set('Authorization', 'Bearer ' + ordinaryToken)
    .expect(200);
  expect(contracts.RolePermissionsResponse.parse(ordinaryStanding.body).data.canEdit).toBe(false);
  targetEmail = 'synthetic-bound-chief-' + randomUUID() + '@example.test';
  vi.spyOn(identityProvider, 'resendInvite').mockResolvedValue(true);
  await request(app)
    .post('/api/v1/events/' + eventId + '/roster/volunteers')
    .set('Authorization', 'Bearer ' + operatorToken)
    .send({ email: targetEmail, displayName: 'Synthetic bound chief', role: 'CHIEF_COORDINATOR' })
    .expect(201);
  targetId = (await rawDb.person.findUniqueOrThrow({ where: { email: targetEmail } })).id;
  const targetPerson = await rawDb.person.findUniqueOrThrow({ where: { id: targetId } });
  const targetActor = {
    id: targetId,
    email: targetEmail,
    sub: targetPerson.cognitoSub,
    role: 'CHIEF_COORDINATOR' as const,
    token: '',
  };
  await renewFixtureToken(targetActor);
  targetToken = await open(targetActor.token);
  expect(decodeJwt(targetToken).sid).toEqual(expect.any(String));
  await request(app)
    .get('/api/v1/events/' + eventId + '/me')
    .set('Authorization', 'Bearer ' + targetToken)
    .expect(200);
  expect(
    await rawDb.identityAccountOperation.findFirst({ where: { personId: targetId } }),
  ).toMatchObject({ state: 'BOUND' });
  expect(
    await rawDb.identityInvitationAttempt.findFirst({ where: { personId: targetId } }),
  ).toMatchObject({ state: 'ACCEPTED' });
});
afterEach(async () => {
  await settleDenials();
  vi.restoreAllMocks();
});
it.each(targets)(
  '$form $operation permits the organisation platform admin to appoint an existing person as event Admin without another invitation',
  async ({ form, operation }) => {
    const before = await profile(targetId),
      people = await rawDb.person.count();
    const attempts = await rawDb.identityInvitationAttempt.findMany({ orderBy: { id: 'asc' } });
    const operations = await rawDb.identityAccountOperation.findMany({ orderBy: { id: 'asc' } });
    const ensure = vi.spyOn(identityProvider, 'ensureUser'),
      resend = vi.mocked(identityProvider.resendInvite);
    resend.mockClear();
    const response = await request(app)
      .post(path(form, operation === 'provision' ? '/roster/volunteers' : '/roster/import'))
      .set('Authorization', 'Bearer ' + operatorToken)
      .send(
        appointmentBody(operation, {
          email: targetEmail,
          displayName: before.displayName,
          role: 'ADMIN',
        }),
      )
      .expect(operation === 'provision' ? 201 : 200);
    if (operation === 'provision')
      expect(contracts.ProvisionVolunteerResponse.parse(response.body)).toMatchObject({
        identityCreated: false,
        volunteer: { id: targetId, role: 'ADMIN' },
      });
    else
      expect(contracts.RosterImportResponse.parse(response.body)).toMatchObject({
        committed: true,
        issues: [],
      });
    expect(
      await rawDb.eventMembership.findUnique({
        where: {
          eventId_personId: {
            eventId: form === 'scoped' ? otherEventId : eventId,
            personId: targetId,
          },
        },
      }),
    ).toMatchObject({ role: 'ADMIN' });
    expect(await rawDb.person.count()).toBe(people);
    expect(await profile(targetId)).toEqual(before);
    expect(await rawDb.identityAccountOperation.findMany({ orderBy: { id: 'asc' } })).toEqual(
      operations,
    );
    expect(await rawDb.identityInvitationAttempt.findMany({ orderBy: { id: 'asc' } })).toEqual(
      attempts,
    );
    expect(ensure).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
    await request(app)
      .get('/api/v1/events/' + eventId + '/me')
      .set('Authorization', 'Bearer ' + targetToken)
      .expect(401);
    if (form === 'scoped')
      expect(
        await rawDb.eventMembership.findUnique({
          where: { eventId_personId: { eventId, personId: targetId } },
        }),
      ).toMatchObject({ role: 'CHIEF_COORDINATOR' });
  },
);
it.each(targets)(
  '$form $operation refuses an ordinary event Admin appointing another Admin before provider work',
  async ({ form, operation }) => {
    const ensure = vi.spyOn(identityProvider, 'ensureUser'),
      resend = vi.mocked(identityProvider.resendInvite);
    resend.mockClear();
    const before = await profile(targetId),
      memberships = await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } });
    await request(app)
      .post(path(form, operation === 'provision' ? '/roster/volunteers' : '/roster/import'))
      .set('Authorization', 'Bearer ' + ordinaryToken)
      .send(
        appointmentBody(operation, {
          email: targetEmail,
          displayName: before.displayName,
          role: 'ADMIN',
        }),
      )
      .expect(403);
    expect(await profile(targetId)).toEqual(before);
    expect(await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } })).toEqual(memberships);
    expect(ensure).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  },
);
it.each(targets)(
  '$form $operation retains the platform admin self-mutation refusal and unchanged memberships',
  async ({ form, operation }) => {
    const ensure = vi.spyOn(identityProvider, 'ensureUser'),
      resend = vi.mocked(identityProvider.resendInvite);
    resend.mockClear();
    const before = await profile(operatorId),
      memberships = await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } });
    await request(app)
      .post(path(form, operation === 'provision' ? '/roster/volunteers' : '/roster/import'))
      .set('Authorization', 'Bearer ' + operatorToken)
      .send(
        appointmentBody(operation, {
          email: operatorEmail,
          displayName: before.displayName,
          role: 'ADMIN',
        }),
      )
      .expect(403);
    expect(await profile(operatorId)).toEqual(before);
    expect(await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } })).toEqual(memberships);
    expect(ensure).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  },
);
