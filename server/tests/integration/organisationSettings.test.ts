import { randomUUID } from 'node:crypto';
import { OrganisationSettingsResponse } from '@spoh/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, testEvent, type TestVolunteer } from '../helpers/fixtures.js';

/**
 * Organisation-wide settings (platform scope, D-17): event Chiefs and Admins read
 * them; only a current platform admin of the event's organisation changes them.
 */
const app = createApp();
const DEFAULTS = {
  dashboardPollSeconds: 3,
  alertPollSeconds: 10,
  refreshSessionDays: 30,
  idempotencyRetentionDays: 7,
};
const NO_VERSIONS = {
  dashboardPollSeconds: 0,
  alertPollSeconds: 0,
  refreshSessionDays: 0,
  idempotencyRetentionDays: 0,
};

let organisationId: string;
let chief: TestVolunteer;
let eventAdmin: TestVolunteer;
let volunteer: TestVolunteer;
let platformAdmin: TestVolunteer;

const read = (who: TestVolunteer) =>
  request(app).get('/api/v1/admin/organisation-settings').set('Authorization', bearer(who));
const change = (who: TestVolunteer, body: object) =>
  request(app)
    .patch('/api/v1/admin/organisation-settings')
    .set('Authorization', bearer(who))
    .send(body);
const setOrganisationRole = (personId: string, role: 'MEMBER' | 'PLATFORM_ADMIN') =>
  rawDb.organisationMembership.upsert({
    where: { organisationId_personId: { organisationId, personId } },
    create: { organisationId, personId, role },
    update: { role },
  });

beforeEach(async () => {
  await resetDatabase();
  const { eventId } = await testEvent();
  organisationId = (await rawDb.event.findUniqueOrThrow({ where: { id: eventId } })).organisationId;
  chief = await createVolunteer({ email: 'chief@org.test', role: 'CHIEF_COORDINATOR' });
  eventAdmin = await createVolunteer({ email: 'admin@org.test', role: 'ADMIN' });
  volunteer = await createVolunteer({ email: 'v@org.test', role: 'VOLUNTEER' });
  // A platform admin's event role does not matter: here they only volunteer.
  platformAdmin = await createVolunteer({ email: 'platform@org.test', role: 'VOLUNTEER' });
  await setOrganisationRole(platformAdmin.id, 'PLATFORM_ADMIN');
});

describe('organisation settings', () => {
  it('lets event Chiefs and Admins read the defaults, privately, without the right to change', async () => {
    for (const who of [chief, eventAdmin]) {
      const response = await read(who);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(OrganisationSettingsResponse.parse(response.body)).toEqual({
        organisationId,
        settings: DEFAULTS,
        versions: NO_VERSIONS,
        canChange: false,
      });
    }
    const denied = await read(volunteer);
    expect(denied.status).toBe(403);
    expect(denied.headers['cache-control']).toBe('no-store');
  });

  it('lets a platform admin change one key at the version read, with history and audit', async () => {
    expect((await read(platformAdmin)).body.canChange).toBe(true);
    const response = await change(platformAdmin, {
      key: 'refreshSessionDays',
      value: 7,
      expectedVersion: 0,
      reason: 'shorter sessions on shared phones',
    });
    expect(response.status).toBe(200);
    expect(response.body.settings).toEqual({ ...DEFAULTS, refreshSessionDays: 7 });
    expect(response.body.versions.refreshSessionDays).toBe(1);

    expect(await rawDb.setting.findMany({ where: { key: 'refreshSessionDays' } })).toMatchObject([
      { scope: 'PLATFORM', scopeId: organisationId, eventId: null, value: 7, version: 1 },
    ]);
    expect(
      await rawDb.settingChange.findMany({ where: { key: 'refreshSessionDays' } }),
    ).toMatchObject([
      {
        scope: 'PLATFORM',
        scopeId: organisationId,
        version: 1,
        // The effective value it replaced: the compiled default.
        before: 30,
        after: 7,
        source: 'USER',
        actorPersonId: platformAdmin.id,
        reason: 'shorter sessions on shared phones',
      },
    ]);
    const audit = await rawDb.auditLog.findFirst({ where: { action: 'setting.change' } });
    expect(audit?.entityId).toBe('refreshSessionDays');
    expect((await read(chief)).body.settings.refreshSessionDays).toBe(7);
  });

  it('refuses event Chiefs and Admins, and writes nothing', async () => {
    for (const who of [chief, eventAdmin, volunteer]) {
      const response = await change(who, {
        key: 'alertPollSeconds',
        value: 12,
        expectedVersion: 0,
      });
      expect(response.status).toBe(403);
    }
    expect(await rawDb.setting.count()).toBe(0);
    expect(await rawDb.settingChange.count()).toBe(0);
  });

  it('uses the current organisation role, not one the session started with', async () => {
    await setOrganisationRole(platformAdmin.id, 'MEMBER');
    const response = await change(platformAdmin, {
      key: 'alertPollSeconds',
      value: 12,
      expectedVersion: 0,
    });
    expect(response.status).toBe(403);
    expect(await rawDb.setting.count()).toBe(0);
  });

  it('keeps each key within its registered bounds and refuses a stale version', async () => {
    for (const body of [
      { key: 'alertPollSeconds', value: 4, expectedVersion: 0 },
      { key: 'alertPollSeconds', value: 31, expectedVersion: 0 },
      { key: 'refreshSessionDays', value: 0, expectedVersion: 0 },
      { key: 'idempotencyRetentionDays', value: 91, expectedVersion: 0 },
      { key: 'lostPersonPurgeHours', value: 12, expectedVersion: 0 },
    ])
      expect((await change(platformAdmin, body)).status).toBe(400);
    await change(platformAdmin, { key: 'dashboardPollSeconds', value: 5, expectedVersion: 0 });
    const stale = await change(platformAdmin, {
      key: 'dashboardPollSeconds',
      value: 6,
      expectedVersion: 0,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('SETTING_VERSION_CONFLICT');
  });

  it("never reads or writes another organisation's settings", async () => {
    const other = await rawDb.organisation.create({
      data: {
        slug: `other-org-${randomUUID()}`,
        name: 'Other',
        appName: 'Other',
        defaultTimezone: 'Asia/Singapore',
      },
    });
    try {
      await rawDb.setting.create({
        data: {
          scope: 'PLATFORM',
          scopeId: other.id,
          eventId: null,
          key: 'alertPollSeconds',
          value: 25,
          version: 4,
        },
      });
      expect((await read(platformAdmin)).body.settings.alertPollSeconds).toBe(10);
      await change(platformAdmin, { key: 'alertPollSeconds', value: 12, expectedVersion: 0 });
      expect(
        await rawDb.setting.findFirst({ where: { scopeId: other.id, key: 'alertPollSeconds' } }),
      ).toMatchObject({ value: 25, version: 4 });
    } finally {
      // Organisations outlive resetDatabase; leave none behind.
      await rawDb.setting.deleteMany({ where: { scopeId: other.id } });
      await rawDb.organisation.delete({ where: { id: other.id } });
    }
  });

  it('shows the default for an invalid stored value, at its stored version', async () => {
    await rawDb.setting.create({
      data: {
        scope: 'PLATFORM',
        scopeId: organisationId,
        eventId: null,
        key: 'alertPollSeconds',
        value: 'often',
        version: 2,
      },
    });
    const { body } = await read(chief);
    expect(body.settings.alertPollSeconds).toBe(10);
    expect(body.versions.alertPollSeconds).toBe(2);
  });
});
