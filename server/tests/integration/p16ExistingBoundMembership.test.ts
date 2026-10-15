import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { identityProvider } from '../../src/platform/identity/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  renewFixtureToken,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
const app = createApp();
let admin: TestVolunteer, eventId: string, otherId: string, target: TestVolunteer;
const row = {
  email: 'synthetic-existing-bound@example.test',
  displayName: 'Synthetic existing bound person',
  role: 'VOLUNTEER',
};
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
  admin = await createVolunteer({ email: 'synthetic-bound-admin@example.test', role: 'ADMIN' });
  const home = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const other = await createEvent({
    organisationId: home.organisationId,
    slug: 'synthetic-bound-additional',
    name: 'Synthetic additional event',
    timezone: home.timezone,
    status: 'DRAFT',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  otherId = other.id;
  await rawDb.eventMembership.create({
    data: { eventId: otherId, personId: admin.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  vi.spyOn(identityProvider, 'resendInvite')
    .mockRejectedValueOnce(new Error('Synthetic unknown initial delivery'))
    .mockResolvedValue(true);
  vi.spyOn(identityProvider, 'ensureUser');
  await request(app)
    .post(`/api/v1/events/${eventId}/roster/volunteers`)
    .set('Authorization', bearer(admin))
    .send(row)
    .expect(503);
  const person = await rawDb.person.findUniqueOrThrow({ where: { email: row.email } });
  target = {
    id: person.id,
    email: person.email,
    sub: person.cognitoSub,
    role: 'VOLUNTEER',
    token: '',
  };
  expect(
    await rawDb.identityAccountOperation.findFirst({ where: { personId: target.id } }),
  ).toMatchObject({ state: 'BOUND' });
  expect(
    await rawDb.identityInvitationAttempt.findFirst({ where: { personId: target.id } }),
  ).toMatchObject({ state: 'DELIVERY_UNKNOWN' });
});
afterEach(() => vi.restoreAllMocks());
async function normalSignIn() {
  await renewFixtureToken(target);
  const opened = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken: target.token })
    .expect(201);
  await request(app)
    .get(`/api/v1/events/${eventId}/me`)
    .set('Authorization', 'Bearer ' + opened.body.accessToken)
    .expect(200);
  expect(
    await rawDb.eventMembership.findUnique({
      where: { eventId_personId: { eventId, personId: target.id } },
    }),
  ).toMatchObject({ status: 'ACTIVE', lastSeenAt: expect.any(Date) });
}
function add(operation: string) {
  return request(app)
    .post(
      `/api/v1/events/${otherId}/roster/` + (operation === 'provision' ? 'volunteers' : 'import'),
    )
    .set('Authorization', bearer(admin))
    .send(
      operation === 'provision'
        ? { ...row, idempotencyKey: randomUUID() }
        : { commit: true, rows: [row] },
    );
}
for (const operation of ['provision', 'import'])
  for (const acceptedResend of [false, true])
    it(`${operation} adds a normally authenticated bound person without revisiting old delivery uncertainty (later resend ${acceptedResend})`, async () => {
      if (acceptedResend)
        await request(app)
          .post(`/api/v1/events/${eventId}/admin/volunteers/${target.id}/resend-invite`)
          .set('Authorization', bearer(admin))
          .send({ idempotencyKey: randomUUID() })
          .expect(200);
      await normalSignIn();
      const profile = await rawDb.person.findUniqueOrThrow({ where: { id: target.id } }),
        memberships = await rawDb.eventMembership.findMany({ where: { personId: target.id } }),
        accounts = await rawDb.identityAccountOperation.findMany({
          where: { personId: target.id },
        }),
        invitations = await rawDb.identityInvitationAttempt.findMany({
          where: { personId: target.id },
        });
      const sends = vi.mocked(identityProvider.resendInvite).mock.calls.length;
      await add(operation).expect(operation === 'provision' ? 201 : 200);
      expect(await rawDb.person.findUnique({ where: { id: target.id } })).toEqual(profile);
      expect(
        await rawDb.eventMembership.findMany({ where: { personId: target.id, eventId } }),
      ).toEqual(memberships);
      expect(
        await rawDb.eventMembership.findUnique({
          where: { eventId_personId: { eventId: otherId, personId: target.id } },
        }),
      ).toMatchObject({ role: 'VOLUNTEER', status: 'INVITED' });
      expect(
        await rawDb.identityAccountOperation.findMany({ where: { personId: target.id } }),
      ).toEqual(accounts);
      expect(
        await rawDb.identityInvitationAttempt.findMany({ where: { personId: target.id } }),
      ).toEqual(invitations);
      expect(identityProvider.ensureUser).toHaveBeenCalledTimes(1);
      expect(identityProvider.resendInvite).toHaveBeenCalledTimes(sends);
    });
for (const operation of ['provision', 'import'])
  for (const condition of ['never-authenticated', 'inactive-history'])
    it(`${operation} retains the unknown-delivery refusal for ${condition}`, async () => {
      if (condition === 'inactive-history') {
        await normalSignIn();
        await rawDb.eventMembership.update({
          where: { eventId_personId: { eventId, personId: target.id } },
          data: { status: 'DEACTIVATED' },
        });
      } else
        await rawDb.eventMembership.update({
          where: { eventId_personId: { eventId, personId: target.id } },
          data: { status: 'ACTIVE' },
        });
      await add(operation).expect(503);
      expect(identityProvider.resendInvite).toHaveBeenCalledTimes(1);
      expect(await rawDb.identityInvitationAttempt.count({ where: { personId: target.id } })).toBe(
        1,
      );
      expect(
        await rawDb.identityInvitationAttempt.findFirst({ where: { personId: target.id } }),
      ).toMatchObject({ state: 'DELIVERY_UNKNOWN' });
    });
