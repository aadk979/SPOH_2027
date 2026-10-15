import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { prisma } from '../../src/platform/db/client.js';
import { requireCurrentPermission } from '../../src/platform/access/currentPermission.js';
import { isPlatformAdministrator } from '../../src/platform/access/platformAdministrator.js';
import { ForbiddenError } from '../../src/platform/errors/index.js';
import { identityProvider, invalidateVolunteerCache } from '../../src/platform/identity/index.js';
import { settleDenials } from '../../src/platform/http/authorizationDenials.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  createVolunteer,
  makePlatformAdmin,
  membershipOf,
  renewFixtureToken,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';
const app = createApp();
let eventId: string, organisationId: string, root: TestVolunteer, token: string;
const open = async (providerAccessToken: string) => {
  const response = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken })
    .expect(201);
  return response.body.accessToken as string;
};
beforeEach(async () => {
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  const event = await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
  organisationId = event.organisationId;
  root = await createVolunteer({ email: 'synthetic-authority-owner@example.test', role: 'ADMIN' });
  await makePlatformAdmin(root.id);
  token = await open(root.token);
});
afterEach(async () => {
  await settleDenials();
  vi.restoreAllMocks();
});
it('selects person authority only from current active standing in the event organisation', async () => {
  expect(await isPlatformAdministrator(prisma, { scope: { eventId }, personId: root.id })).toBe(
    true,
  );
  await rawDb.organisationMembership.update({
    where: { organisationId_personId: { organisationId, personId: root.id } },
    data: { role: 'MEMBER' },
  });
  expect(await isPlatformAdministrator(prisma, { scope: { eventId }, personId: root.id })).toBe(
    false,
  );
});
it('cannot borrow platform standing from another organisation to appoint an event Admin', async () => {
  const organisation = await rawDb.organisation.create({
    data: {
      slug: 'synthetic-other-authority',
      name: 'Synthetic other organisation',
      appName: 'Synthetic other',
      defaultTimezone: 'Asia/Singapore',
    },
  });
  const other = await createEvent({
    organisationId: organisation.id,
    slug: 'synthetic-other-authority',
    name: 'Synthetic other authority',
    timezone: 'Asia/Singapore',
    status: 'DRAFT',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  await rawDb.eventMembership.create({
    data: { eventId: other.id, personId: root.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  expect(
    await isPlatformAdministrator(prisma, { scope: { eventId: other.id }, personId: root.id }),
  ).toBe(false);
  const ensure = vi.spyOn(identityProvider, 'ensureUser'),
    invite = vi.spyOn(identityProvider, 'resendInvite');
  await request(app)
    .post('/api/v1/events/' + other.id + '/roster/volunteers')
    .set('Authorization', 'Bearer ' + token)
    .send({
      email: 'synthetic-uncreated-admin@example.test',
      displayName: 'Synthetic refused administrator',
      role: 'ADMIN',
    })
    .expect(403);
  expect(ensure).not.toHaveBeenCalled();
  expect(invite).not.toHaveBeenCalled();
  expect(
    await rawDb.person.count({ where: { email: 'synthetic-uncreated-admin@example.test' } }),
  ).toBe(0);
});
it('does not select platform authority for an absent event', async () => {
  expect(
    await isPlatformAdministrator(prisma, {
      scope: { eventId: 'synthetic-absent-event' },
      personId: root.id,
    }),
  ).toBe(false);
});
it.each(['deactivatedAt', 'piiErasedAt'] as const)(
  'does not select platform authority for a person with %s',
  async (field) => {
    await rawDb.person.update({
      where: { id: root.id },
      data: field === 'deactivatedAt' ? { deactivatedAt: FROZEN_NOW } : { piiErasedAt: FROZEN_NOW },
    });
    expect(await isPlatformAdministrator(prisma, { scope: { eventId }, personId: root.id })).toBe(
      false,
    );
  },
);
it('person authority still requires an active membership in the event being changed', async () => {
  const member = await membershipOf(root.id);
  await rawDb.eventMembership.update({ where: { id: member.id }, data: { status: 'DEACTIVATED' } });
  await expect(
    prisma.$transaction((tx) =>
      requireCurrentPermission(tx, {
        scope: { eventId },
        membershipId: member.id,
        personId: root.id,
        action: 'People.Invite',
        asPerson: true,
        resource: { type: 'Event', id: eventId },
        facts: { grantedRank: 60 },
      }),
    ),
  ).rejects.toBeInstanceOf(ForbiddenError);
});
it('an empty person question cannot fall back to an editable membership grant', async () => {
  const member = await membershipOf(root.id);
  await expect(
    prisma.$transaction((tx) =>
      requireCurrentPermission(tx, {
        scope: { eventId },
        membershipId: member.id,
        personId: root.id,
        action: 'People.Invite',
        asPerson: true,
        resource: [],
        facts: { grantedRank: 60 },
      }),
    ),
  ).rejects.toBeInstanceOf(ForbiddenError);
});
it('uses separate platform standing rather than inventing a higher committee rank', async () => {
  const target = await createVolunteer({
    email: 'synthetic-existing-chief@example.test',
    role: 'CHIEF_COORDINATOR',
  });
  const targetPerson = await rawDb.person.findUniqueOrThrow({ where: { id: target.id } });
  await rawDb.eventMembership.update({
    where: { id: (await membershipOf(root.id)).id },
    data: { role: 'VOLUNTEER' },
  });
  root.role = 'VOLUNTEER';
  await renewFixtureToken(root);
  invalidateVolunteerCache();
  token = await open(root.token);
  const ensure = vi.spyOn(identityProvider, 'ensureUser'),
    invite = vi.spyOn(identityProvider, 'resendInvite');
  await request(app)
    .post('/api/v1/events/' + eventId + '/roster/volunteers')
    .set('Authorization', 'Bearer ' + token)
    .send({ email: target.email, displayName: targetPerson.displayName, role: 'ADMIN' })
    .expect(201);
  expect(
    await rawDb.eventMembership.findUnique({
      where: { eventId_personId: { eventId, personId: target.id } },
    }),
  ).toMatchObject({ role: 'ADMIN' });
  expect(ensure).not.toHaveBeenCalled();
  expect(invite).not.toHaveBeenCalled();
});
it.each(['scoped', 'alias'] as const)(
  '%s rechecks withdrawn platform standing after the provider stage before binding',
  async (form) => {
    const email = 'synthetic-withdrawn-' + randomUUID() + '@example.test',
      originalPeople = await rawDb.person.count();
    const ensure = vi.spyOn(identityProvider, 'ensureUser').mockImplementation(async () => {
      await rawDb.organisationMembership.update({
        where: { organisationId_personId: { organisationId, personId: root.id } },
        data: { role: 'MEMBER' },
      });
      return { sub: 'synthetic-unbound-' + randomUUID(), username: email, created: true };
    });
    const invite = vi.spyOn(identityProvider, 'resendInvite');
    await request(app)
      .post((form === 'scoped' ? '/api/v1/events/' + eventId : '/api/v1') + '/roster/volunteers')
      .set('Authorization', 'Bearer ' + token)
      .send({ email, displayName: 'Synthetic unbound account', role: 'ADMIN' })
      .expect(403);
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(invite).not.toHaveBeenCalled();
    expect(await rawDb.person.count()).toBe(originalPeople);
    expect(await rawDb.person.count({ where: { email } })).toBe(0);
    expect(await rawDb.identityAccountOperation.findFirst()).toMatchObject({
      state: 'PROVIDER_READY',
      personId: null,
    });
    expect(await rawDb.identityInvitationAttempt.count()).toBe(0);
  },
);
