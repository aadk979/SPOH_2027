import { MyPermissionsResponse } from '@spoh/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, testEvent, type TestVolunteer } from '../helpers/fixtures.js';

/**
 * What a member may do, for the screens (P11.8, ADR-005 §6): the local engine answers from the
 * same policies the enforcement points use, with the event's own grants.
 */
let app: Express;
let eventId: string;

async function permissions(who: TestVolunteer): Promise<MyPermissionsResponse> {
  const response = await request(app)
    .get('/api/v1/me/permissions')
    .set('Authorization', bearer(who));
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  return MyPermissionsResponse.parse(response.body);
}

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  ({ eventId } = await testEvent());
});

describe('my permissions', () => {
  it('lets a volunteer report and raise, and nothing in configuration', async () => {
    const volunteer = await createVolunteer({ email: 'v@perm.test', role: 'VOLUNTEER' });
    const mine = await permissions(volunteer);
    expect(mine.actions).toMatchObject({
      'Incident.Report': true,
      'LostPerson.Raise': true,
      'Structure.Read': false,
      'Settings.Read': false,
    });
    expect(mine.settings).toEqual({ operational: false, security: false, privacy: false });
  });

  it('keeps security and privacy settings from an event Admin who is not a platform admin (C9)', async () => {
    const admin = await createVolunteer({ email: 'a@perm.test', role: 'ADMIN' });
    const mine = await permissions(admin);
    expect(mine.actions).toMatchObject({
      'Structure.Edit': true,
      'Settings.Read': true,
      'Event.Archive': false,
      'Event.Reopen': false,
    });
    expect(mine.settings).toEqual({ operational: true, security: false, privacy: false });
  });

  it('gives a platform admin the locked actions in an event they are a member of', async () => {
    const admin = await createVolunteer({ email: 'p@perm.test', role: 'ADMIN' });
    const { organisationId } = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
    await rawDb.organisationMembership.upsert({
      where: { organisationId_personId: { organisationId, personId: admin.id } },
      create: { organisationId, personId: admin.id, role: 'PLATFORM_ADMIN' },
      update: { role: 'PLATFORM_ADMIN' },
    });
    const mine = await permissions(admin);
    expect(mine.actions).toMatchObject({ 'Event.Archive': true, 'Event.Reopen': true });
    expect(mine.settings).toEqual({ operational: true, security: true, privacy: true });
  });

  it('follows the event’s own grants', async () => {
    const admin = await createVolunteer({ email: 'g@perm.test', role: 'ADMIN' });
    await rawDb.rolePermission.deleteMany({
      where: { eventId, role: 'ADMIN', action: 'Settings.Read' },
    });
    expect((await permissions(admin)).actions['Settings.Read']).toBe(false);
  });
});
