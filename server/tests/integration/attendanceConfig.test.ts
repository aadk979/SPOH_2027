import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  testEvent,
  type TestVolunteer,
  makePlatformAdmin,
} from '../helpers/fixtures.js';

const app = createApp();
let admin: TestVolunteer;
let volunteer: TestVolunteer;

beforeEach(async () => {
  await resetDatabase();
  admin = await createVolunteer({ email: 'admin@attendance-config.test', role: 'ADMIN' });
  // Trusted networks and the attendance root are security settings (C9).
  await makePlatformAdmin(admin.id);
  volunteer = await createVolunteer({
    email: 'volunteer@attendance-config.test',
    role: 'VOLUNTEER',
  });
});

const endpoint = '/api/v1/admin/attendance-settings';
const read = (who: TestVolunteer) => request(app).get(endpoint).set('Authorization', bearer(who));
const change = (who: TestVolunteer, body: object) =>
  request(app).patch(endpoint).set('Authorization', bearer(who)).send(body);
const testNetwork = (who: TestVolunteer, body: object) =>
  request(app)
    .post(`${endpoint}/test-network`)
    .set('Authorization', bearer(who))
    .set('X-Forwarded-For', '198.51.100.7')
    .send(body);

describe('attendance administration (P10.4)', () => {
  it('offers active event admins as roots, saves a versioned choice, and detects a stale root', async () => {
    const { eventId } = await testEvent();
    const adminMember = await rawDb.eventMembership.findUniqueOrThrow({
      where: { eventId_personId: { eventId, personId: admin.id } },
    });
    const initial = await read(admin);
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      rootMembershipId: null,
      rootIsStale: false,
      campusCidrs: [],
      versions: { rootMembershipId: 0, campusCidrs: 0 },
      eligibleRoots: [{ id: adminMember.id }],
    });
    expect(initial.headers['cache-control']).toBe('no-store');

    const saved = await change(admin, {
      key: 'attendance.rootMembershipId',
      value: adminMember.id,
      expectedVersion: 0,
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      rootMembershipId: adminMember.id,
      rootIsStale: false,
      versions: { rootMembershipId: 1 },
    });
    expect(
      await rawDb.settingChange.count({ where: { eventId, key: 'attendance.rootMembershipId' } }),
    ).toBe(1);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'setting.change' } })).toBe(1);

    await rawDb.eventMembership.update({
      where: { id: adminMember.id },
      data: { status: 'DEACTIVATED' },
    });
    // A different config manager can see and replace a now-invalid choice.
    const manager = await createVolunteer({
      email: 'chief@attendance-config.test',
      role: 'CHIEF_COORDINATOR',
    });
    const stale = await read(manager);
    expect(stale.body).toMatchObject({
      rootMembershipId: adminMember.id,
      rootIsStale: true,
      eligibleRoots: [],
    });
  });

  it('rejects an ineligible root, a stale version, and a caller without config.manage', async () => {
    const { eventId } = await testEvent();
    const member = await rawDb.eventMembership.findUniqueOrThrow({
      where: { eventId_personId: { eventId, personId: volunteer.id } },
    });
    const body = {
      key: 'attendance.rootMembershipId',
      value: member.id,
      expectedVersion: 0,
    };
    expect((await change(admin, body)).status).toBe(400);
    expect((await read(volunteer)).status).toBe(403);
    expect((await change(volunteer, { ...body, value: null })).status).toBe(403);
    expect((await testNetwork(volunteer, { cidrs: [] })).status).toBe(403);

    expect((await change(admin, { ...body, value: null })).status).toBe(200);
    const stale = await change(admin, { ...body, value: null });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('SETTING_VERSION_CONFLICT');
  });

  it('validates trusted CIDRs and tests the real request IP without saving drafts', async () => {
    expect(
      (
        await change(admin, {
          key: 'attendance.campusCidrs',
          value: ['127.0.0.0/33'],
          expectedVersion: 0,
        })
      ).status,
    ).toBe(400);
    expect((await testNetwork(admin, { cidrs: ['127.0.0.0/33'] })).status).toBe(400);

    const outside = await testNetwork(admin, { cidrs: ['198.51.100.0/24'] });
    expect(outside.status).toBe(200);
    expect(outside.body.trusted).toBe(false);
    expect(outside.body.ip).not.toBe('198.51.100.7');
    const local = await testNetwork(admin, { cidrs: ['127.0.0.1/32', '::1/128'] });
    expect(local.status).toBe(200);
    expect(local.body.trusted).toBe(true);
    expect((await read(admin)).body.campusCidrs).toEqual([]);

    const saved = await change(admin, {
      key: 'attendance.campusCidrs',
      value: ['127.0.0.1/32', '::1/128'],
      expectedVersion: 0,
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      campusCidrs: ['127.0.0.1/32', '::1/128'],
      versions: { campusCidrs: 1 },
    });
  });
});
