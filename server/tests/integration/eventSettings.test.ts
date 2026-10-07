import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { lostPersonRetentionHours } from '../../src/modules/lostPerson/application/retentionPolicy.js';
import { prisma } from '../../src/platform/db/client.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createStation,
  createVolunteer,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * Event settings (ADR-003 §2) holding the product rules (ADR-002 §4, P09.14):
 * per event, versioned, one key at a time against the version read, locked by
 * the event's state, with history and audit.
 */

let app: Express;
let chief: TestVolunteer;
let ic: TestVolunteer;
let volunteer: TestVolunteer;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  chief = await createVolunteer({ email: 'chief@settings.test', role: 'CHIEF_COORDINATOR' });
  ic = await createVolunteer({ email: 'ic@settings.test', role: 'IC' });
  volunteer = await createVolunteer({ email: 'v@settings.test', role: 'VOLUNTEER' });
});

const read = (who: TestVolunteer) =>
  request(app).get('/api/v1/admin/event-settings').set('Authorization', bearer(who));
const change = (who: TestVolunteer, body: object) =>
  request(app).patch('/api/v1/admin/event-settings').set('Authorization', bearer(who)).send(body);

const HEADLINE = { mode: 'headline', source: { count: 'registrations' } };

describe('event settings (ADR-003, P09.14)', () => {
  it("starts at today's behaviour: separate counts, no visitor data", async () => {
    const response = await read(volunteer);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      settings: {
        'product.countsMode': { mode: 'separate' },
        'product.visitorDataMode': 'none',
        lostPersonPurgeHours: 24,
      },
      versions: { 'product.countsMode': 0, 'product.visitorDataMode': 0, lostPersonPurgeHours: 0 },
    });
  });

  it('stores a change as the next version, with its history and audit row', async () => {
    const response = await change(chief, {
      key: 'product.countsMode',
      value: HEADLINE,
      expectedVersion: 0,
      reason: 'the sponsor asks for one number',
    });
    expect(response.status).toBe(200);
    expect(response.body.settings['product.countsMode']).toEqual(HEADLINE);
    expect(response.body.versions['product.countsMode']).toBe(1);

    const history = await rawDb.settingChange.findMany({ where: { key: 'product.countsMode' } });
    expect(history).toMatchObject([
      { version: 1, before: { mode: 'separate' }, after: HEADLINE, source: 'USER' },
    ]);
    const audit = await rawDb.auditLog.findFirst({ where: { action: 'setting.change' } });
    expect(audit?.entityId).toBe('product.countsMode');
  });

  it('refuses a change made to a version someone else has already changed', async () => {
    await change(chief, { key: 'product.countsMode', value: HEADLINE, expectedVersion: 0 });
    const stale = await change(chief, {
      key: 'product.countsMode',
      value: { mode: 'separate' },
      expectedVersion: 0,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('SETTING_VERSION_CONFLICT');
    expect((await read(chief)).body.settings['product.countsMode']).toEqual(HEADLINE);
  });

  it('has no mode that adds the counts together', async () => {
    const sum = await change(chief, {
      key: 'product.countsMode',
      value: { mode: 'sum' },
      expectedVersion: 0,
    });
    expect(sum.status).toBe(400);
  });

  it('takes a footfall headline only from a station of the event that counts entries', async () => {
    const door = await createStation({ code: 'DOOR', countsEntry: true });
    const desk = await createStation({ code: 'DESK' });
    const at = (stationId: string) =>
      change(chief, {
        key: 'product.countsMode',
        value: { mode: 'headline', source: { count: 'footfall', stationId } },
        expectedVersion: 0,
      });
    expect((await at(desk.id)).status).toBe(422);
    expect((await at('c00000000000000000000000')).status).toBe(404);
    expect((await at(door.id)).status).toBe(200);
  });

  it('switches visitor data on only before the event goes live', async () => {
    const { eventId } = await testEvent();
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
    const live = await change(chief, {
      key: 'product.visitorDataMode',
      value: 'allowlist',
      expectedVersion: 0,
    });
    expect(live.status).toBe(409);
    expect(live.body.error.code).toBe('SETTING_LOCKED');

    await rawDb.event.update({ where: { id: eventId }, data: { status: 'READY' } });
    const ready = await change(chief, {
      key: 'product.visitorDataMode',
      value: 'allowlist',
      expectedVersion: 0,
    });
    expect(ready.status).toBe(200);
  });

  it('lets every member read the rules, and only config.manage change them', async () => {
    expect((await read(ic)).status).toBe(200);
    const denied = await change(ic, {
      key: 'product.countsMode',
      value: HEADLINE,
      expectedVersion: 0,
    });
    expect(denied.status).toBe(403);
  });
});

describe('lost-person retention (ADR-003 §8, D-16)', () => {
  const retention = (who: TestVolunteer, value: unknown, expectedVersion = 0) =>
    change(who, { key: 'lostPersonPurgeHours', value, expectedVersion, reason: 'sooner' });
  const purgeHours = async () => {
    const { eventId } = await testEvent();
    const { organisationId } = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
    return prisma.$transaction((tx) => lostPersonRetentionHours(tx, { eventId, organisationId }));
  };

  it('shortens per event as a new version, with history and audit', async () => {
    const response = await retention(chief, 6);
    expect(response.status).toBe(200);
    expect(response.body.settings.lostPersonPurgeHours).toBe(6);
    expect(response.body.versions.lostPersonPurgeHours).toBe(1);
    expect(
      await rawDb.settingChange.findMany({ where: { key: 'lostPersonPurgeHours' } }),
    ).toMatchObject([{ version: 1, before: 24, after: 6, source: 'USER', reason: 'sooner' }]);
    const audit = await rawDb.auditLog.findFirst({ where: { action: 'setting.change' } });
    expect(audit?.entityId).toBe('lostPersonPurgeHours');
    expect(await purgeHours()).toBe(6);
  });

  it('never keeps a description longer than the 24 hours promised to families', async () => {
    for (const value of [25, 720, 0, 1.5, '12']) {
      const refused = await retention(chief, value);
      expect(refused.status).toBe(400);
    }
    expect(await rawDb.setting.count({ where: { key: 'lostPersonPurgeHours' } })).toBe(0);
    expect((await retention(chief, 24)).status).toBe(200);
  });

  it('is changed only with config.manage', async () => {
    expect((await retention(ic, 6)).status).toBe(403);
    expect((await retention(volunteer, 6)).status).toBe(403);
  });
});
