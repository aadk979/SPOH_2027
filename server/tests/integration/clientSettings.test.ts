import { ClientSettingsResponse } from '@spoh/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { readClientSettings } from '../../src/modules/settings/application/readClientSettings.js';
import { ForbiddenError } from '../../src/platform/errors/index.js';
import { loadSettings, overrideSettingsForTest } from '../../src/platform/settings/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  membershipOf,
  setMembership,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * GET /admin/settings/client: a device's tuning for its own event (P10.2). The
 * capture and outbox keys resolve from the scoped store; the legacy global values
 * for them no longer reach a device.
 */
const app = createApp();
const DEFAULTS = {
  dashboardPollSeconds: 3,
  alertPollSeconds: 10,
  captureUndoWindowSeconds: 10,
  captureSendGraceSeconds: 2,
  outboxWarningCount: 20,
  outboxWarningAgeMinutes: 5,
};

let eventId: string;
let organisationId: string;
let otherEventId: string;
let volunteer: TestVolunteer;

async function store(scope: 'PLATFORM' | 'EVENT', key: string, value: unknown, owner = eventId) {
  await rawDb.setting.create({
    data: {
      scope,
      scopeId: scope === 'PLATFORM' ? organisationId : owner,
      eventId: scope === 'PLATFORM' ? null : owner,
      key,
      value: value as never,
      version: 1,
    },
  });
}

const read = (path = '/api/v1/admin/settings/client', who: TestVolunteer | null = volunteer) => {
  const call = request(app).get(path);
  return who ? call.set('Authorization', bearer(who)) : call;
};

beforeEach(async () => {
  await resetDatabase();
  await loadSettings();
  eventId = (await testEvent()).eventId;
  organisationId = (await rawDb.event.findUniqueOrThrow({ where: { id: eventId } })).organisationId;
  otherEventId = (
    await rawDb.event.create({
      data: {
        organisationId,
        slug: 'other-client-event',
        name: 'Other',
        timezone: 'Asia/Singapore',
      },
    })
  ).id;
  volunteer = await createVolunteer({ email: 'device@client.test', role: 'VOLUNTEER' });
});

describe('device settings for the caller’s event', () => {
  it('serves the compiled defaults to any signed-in role, privately', async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(ClientSettingsResponse.parse(response.body)).toEqual({ settings: DEFAULTS });
  });

  it('resolves the capture and outbox keys from the event scope, not the legacy store', async () => {
    const restore = overrideSettingsForTest({
      captureUndoWindowSeconds: 99,
      captureSendGraceSeconds: 99,
      outboxWarningCount: 99,
      outboxWarningAgeMinutes: 99,
      dashboardPollSeconds: 7,
      alertPollSeconds: 12,
    });
    try {
      await store('EVENT', 'captureUndoWindowSeconds', 25);
      await store('EVENT', 'outboxWarningCount', 40);
      const { body } = await read().expect(200);
      expect(body.settings).toEqual({
        // Still platform-wide in the legacy store until their own migration.
        dashboardPollSeconds: 7,
        alertPollSeconds: 12,
        captureUndoWindowSeconds: 25,
        outboxWarningCount: 40,
        // No event override: the compiled default, not the legacy value.
        captureSendGraceSeconds: 2,
        outboxWarningAgeMinutes: 5,
      });
    } finally {
      restore();
    }
  });

  it('never reads another event’s override or a platform row the registry disallows', async () => {
    await store('EVENT', 'captureUndoWindowSeconds', 25, otherEventId);
    await store('PLATFORM', 'outboxWarningCount', 40);
    const { body } = await read().expect(200);
    expect(body.settings).toEqual(DEFAULTS);
  });

  it('falls through an invalid stored value to the default', async () => {
    await store('EVENT', 'captureSendGraceSeconds', 'soon');
    await store('EVENT', 'outboxWarningAgeMinutes', 0);
    const { body } = await read().expect(200);
    expect(body.settings).toEqual(DEFAULTS);
  });

  it('answers the explicit event path the same as its alias', async () => {
    await store('EVENT', 'outboxWarningCount', 40);
    const alias = await read().expect(200);
    const explicit = await read(`/api/v1/events/${eventId}/admin/settings/client`).expect(200);
    expect(explicit.body).toEqual(alias.body);
    expect(explicit.headers['cache-control']).toBe('no-store');
  });

  it('keeps refusals private and reveals nothing', async () => {
    const anonymous = await read('/api/v1/admin/settings/client', null);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    expect(anonymous.body.settings).toBeUndefined();

    const foreign = await read(`/api/v1/events/${otherEventId}/admin/settings/client`);
    expect(foreign.status).not.toBe(200);
    expect(foreign.headers['cache-control']).toBe('no-store');
    expect(foreign.body.settings).toBeUndefined();
  });

  it('rechecks the membership inside the read, after the event lock', async () => {
    const membership = await membershipOf(volunteer.id);
    const actor = {
      volunteerId: volunteer.id,
      membershipId: membership.id,
      scope: { eventId },
      audit: {},
    } as Parameters<typeof readClientSettings>[0];
    await expect(readClientSettings(actor)).resolves.toEqual({ settings: DEFAULTS });
    // Deactivated after the request authenticated: the read itself refuses.
    await setMembership(volunteer.id, { status: 'DEACTIVATED', deactivatedAt: new Date() });
    await expect(readClientSettings(actor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('writes nothing: no audit, history or setting rows', async () => {
    const counts = async () => [
      await rawDb.auditLog.count(),
      await rawDb.settingChange.count(),
      await rawDb.setting.count(),
    ];
    const before = await counts();
    await read().expect(200);
    expect(await counts()).toEqual(before);
  });
});
