import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { prisma } from '../../src/platform/db/client.js';
import { DEFAULT_SETTINGS, getSettings, loadSettings } from '../../src/platform/settings/index.js';
import { resetDatabase, rawDb } from '../helpers/db.js';
import {
  bearer,
  categoryId,
  createEventDayToday,
  createStation,
  createVolunteer,
  shiftOn,
  testEvent,
} from '../helpers/fixtures.js';
import type { TestVolunteer } from '../helpers/fixtures.js';

/**
 * Administration.
 *
 * The tests that matter here are the refusals. An endpoint that lets a Chief
 * Coordinator mint an Admin account is not a user-management feature, it is a
 * privilege-escalation feature — and the same is true of one that lets somebody
 * demote themselves out of the only account that could undo it.
 */
const app = createApp();

let chief: TestVolunteer;
let admin: TestVolunteer;
let volunteer: TestVolunteer;
let ic: TestVolunteer;

beforeEach(async () => {
  await resetDatabase();
  await loadSettings();

  chief = await createVolunteer({ email: 'chief@spoh.test', role: 'CHIEF_COORDINATOR' });
  admin = await createVolunteer({ email: 'admin@spoh.test', role: 'ADMIN' });
  ic = await createVolunteer({ email: 'ic@spoh.test', role: 'IC' });
  volunteer = await createVolunteer({ email: 'vol@spoh.test', role: 'VOLUNTEER' });
});

describe('who may see the roster', () => {
  it('lets a Chief list volunteers', async () => {
    const response = await request(app)
      .get('/api/v1/admin/volunteers')
      .set('Authorization', bearer(chief));

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(4);
  });

  it('refuses a volunteer', async () => {
    const response = await request(app)
      .get('/api/v1/admin/volunteers')
      .set('Authorization', bearer(volunteer));

    expect(response.status).toBe(403);
  });

  it('refuses an IC — running a station is not running the roster', async () => {
    const response = await request(app)
      .get('/api/v1/admin/volunteers')
      .set('Authorization', bearer(ic));

    expect(response.status).toBe(403);
  });

  it('surfaces who has never signed in, which is the question before the event', async () => {
    const response = await request(app)
      .get('/api/v1/admin/volunteers?sort=lastSeen')
      .set('Authorization', bearer(chief));

    const rows = response.body.data as Array<{ hasSignedIn: boolean }>;
    expect(rows.every((row) => row.hasSignedIn === false)).toBe(true);
  });

  it('searches by name and email', async () => {
    const response = await request(app)
      .get('/api/v1/admin/volunteers?q=vol@')
      .set('Authorization', bearer(chief));

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].email).toBe('vol@spoh.test');
  });
});

describe('privilege escalation is refused', () => {
  it('will not let a Chief grant a role above their own', async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/volunteers/${volunteer.id}`)
      .set('Authorization', bearer(chief))
      .send({ role: 'ADMIN' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_ESCALATION_DENIED');
  });

  it('will not let a Chief edit an Admin', async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/volunteers/${admin.id}`)
      .set('Authorization', bearer(chief))
      .send({ portfolio: 'Anything' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_ESCALATION_DENIED');
  });

  it('will not let a Chief edit another Chief', async () => {
    const other = await createVolunteer({
      email: 'chief2@spoh.test',
      role: 'CHIEF_COORDINATOR',
    });

    const response = await request(app)
      .patch(`/api/v1/admin/volunteers/${other.id}`)
      .set('Authorization', bearer(chief))
      .send({ role: 'IC' });

    expect(response.status).toBe(403);
  });

  it('will not let anybody edit their own account', async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/volunteers/${chief.id}`)
      .set('Authorization', bearer(chief))
      .send({ role: 'VOLUNTEER' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SELF_MUTATION_DENIED');
  });

  it('will not let anybody deactivate themselves', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/volunteers/${admin.id}/deactivate`)
      .set('Authorization', bearer(admin))
      .send({ reason: 'testing the guard' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SELF_MUTATION_DENIED');
  });

  it('lets an Admin do what a Chief could not', async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/volunteers/${chief.id}`)
      .set('Authorization', bearer(admin))
      .send({ portfolio: 'Operations' });

    expect(response.status).toBe(200);
    expect(response.body.volunteer.portfolio).toBe('Operations');
  });
});

describe('editing a volunteer', () => {
  it('changes a role and revokes their signed-in devices', async () => {
    const session = await request(app)
      .post('/api/v1/auth/session')
      .send({ email: 'vol@spoh.test' })
      .expect(201);

    const response = await request(app)
      .patch(`/api/v1/admin/volunteers/${volunteer.id}`)
      .set('Authorization', bearer(chief))
      .send({ role: 'IC' });

    expect(response.status).toBe(200);
    expect(response.body.volunteer.role).toBe('IC');
    expect(response.body.sessionsRevoked).toBe(1);

    // A promotion the volunteer's own device does not know about would leave
    // them looking at a home screen missing the tiles they just gained.
    const stale = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${session.body.accessToken as string}`);
    expect(stale.status).toBe(401);
  });

  it('does not revoke anything when nothing that matters changed', async () => {
    await request(app).post('/api/v1/auth/session').send({ email: 'vol@spoh.test' }).expect(201);

    const response = await request(app)
      .patch(`/api/v1/admin/volunteers/${volunteer.id}`)
      .set('Authorization', bearer(chief))
      .send({ phone: '+65 9000 0000' });

    expect(response.body.sessionsRevoked).toBe(0);
  });

  it('refuses a reporting line that would form a loop', async () => {
    await request(app)
      .patch(`/api/v1/admin/volunteers/${volunteer.id}`)
      .set('Authorization', bearer(chief))
      .send({ reportsToId: ic.id })
      .expect(200);

    // ic -> vol -> ic would spin the escalation-chain walk on the boot call.
    const response = await request(app)
      .patch(`/api/v1/admin/volunteers/${ic.id}`)
      .set('Authorization', bearer(chief))
      .send({ reportsToId: volunteer.id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('REPORTING_CYCLE');
  });

  it('writes an audit row with the previous values', async () => {
    await request(app)
      .patch(`/api/v1/admin/volunteers/${volunteer.id}`)
      .set('Authorization', bearer(chief))
      .send({ role: 'IC' })
      .expect(200);

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'user.update', entityId: volunteer.id },
    });

    expect(entry).not.toBeNull();
    expect(entry?.before).toMatchObject({ role: 'VOLUNTEER' });
  });
});

describe('withdrawing access', () => {
  it('locks the account out immediately, not when the token expires', async () => {
    const session = await request(app)
      .post('/api/v1/auth/session')
      .send({ email: 'vol@spoh.test' })
      .expect(201);

    const response = await request(app)
      .post(`/api/v1/admin/volunteers/${volunteer.id}/deactivate`)
      .set('Authorization', bearer(chief))
      .send({ reason: 'lost their phone on the way home' });

    expect(response.status).toBe(200);
    expect(response.body.sessionsRevoked).toBe(1);

    const after = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${session.body.accessToken as string}`);
    expect(after.status).toBe(401);
  });

  it('stops them opening a fresh session', async () => {
    await request(app)
      .post(`/api/v1/admin/volunteers/${volunteer.id}/deactivate`)
      .set('Authorization', bearer(chief))
      .send({ reason: 'left the committee' })
      .expect(200);

    const response = await request(app)
      .post('/api/v1/auth/session')
      .send({ email: 'vol@spoh.test' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('drops their push subscriptions, so a locked-out phone stops being alerted', async () => {
    await prisma.pushSubscription.create({
      data: {
        volunteerId: volunteer.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        p256dh: 'key',
        auth: 'auth',
      },
    });

    await request(app)
      .post(`/api/v1/admin/volunteers/${volunteer.id}/deactivate`)
      .set('Authorization', bearer(chief))
      .send({ reason: 'device was lost' })
      .expect(200);

    expect(await prisma.pushSubscription.count({ where: { volunteerId: volunteer.id } })).toBe(0);
  });

  it('demands a reason', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/volunteers/${volunteer.id}/deactivate`)
      .set('Authorization', bearer(chief))
      .send({});

    expect(response.status).toBe(400);
  });

  it('keeps their captured records', async () => {
    const day = await createEventDayToday();
    const station = await createStation({ code: 'BOOTH_ADMIN' });

    await rawDb.registration.create({
      data: {
        eventId: (await testEvent()).eventId,
        categoryId: await categoryId('SEC_4'),
        stationId: station.id,
        recordedById: volunteer.id,
        idempotencyKey: 'admin-test-keeps-records',
      },
    });
    void day;

    await request(app)
      .post(`/api/v1/admin/volunteers/${volunteer.id}/deactivate`)
      .set('Authorization', bearer(chief))
      .send({ reason: 'left the committee' })
      .expect(200);

    // Deactivation withdraws access. It is not a delete, and the counts a
    // volunteer recorded are the event's data, not theirs.
    expect(await rawDb.registration.count({ where: { recordedById: volunteer.id } })).toBe(1);
  });

  it('restores access on reactivation', async () => {
    await request(app)
      .post(`/api/v1/admin/volunteers/${volunteer.id}/deactivate`)
      .set('Authorization', bearer(chief))
      .send({ reason: 'suspended pending a conversation' })
      .expect(200);

    const response = await request(app)
      .post(`/api/v1/admin/volunteers/${volunteer.id}/reactivate`)
      .set('Authorization', bearer(chief));

    expect(response.status).toBe(200);
    expect(response.body.volunteer.active).toBe(true);
    expect(response.body.volunteer.deactivatedReason).toBeNull();

    await request(app).post('/api/v1/auth/session').send({ email: 'vol@spoh.test' }).expect(201);
  });
});

describe('runtime settings', () => {
  it('is readable by anyone signed in, because the client needs the poll cadence', async () => {
    const response = await request(app)
      .get('/api/v1/admin/settings')
      .set('Authorization', bearer(volunteer));

    expect(response.status).toBe(200);
    expect(response.body.settings.dashboardPollSeconds).toBe(3);
    expect(response.body.overriddenKeys).toEqual([]);
  });

  it('is only writable by config.manage', async () => {
    const response = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', bearer(ic))
      .send({ lostPersonPurgeHours: 5 });

    expect(response.status).toBe(403);
  });

  it('stores an override and reports which keys are no longer defaults', async () => {
    const response = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', bearer(chief))
      .send({ lostPersonPurgeHours: 5 });

    expect(response.status).toBe(200);
    expect(response.body.settings.lostPersonPurgeHours).toBe(5);
    expect(response.body.overriddenKeys).toContain('lostPersonPurgeHours');
    expect(getSettings().lostPersonPurgeHours).toBe(5);
  });

  it.each([
    ['silentStationMinutes', 5],
    ['staleDeviceMinutes', 5],
    ['implausibleTapsPerMinute', 5],
    ['longShiftMinutes', 5],
    ['captureUndoWindowSeconds', 5],
    ['captureSendGraceSeconds', 5],
    ['outboxWarningCount', 5],
    ['outboxWarningAgeMinutes', 5],
  ])('refuses %s here, because the scoped catalogue now owns it', async (key, value) => {
    const response = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', bearer(chief))
      .send({ [key]: value });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details).toEqual({
      keys: [key],
      replacement: '/admin/settings/catalogue',
    });
    expect(await rawDb.appSetting.count()).toBe(0);
    expect(await rawDb.auditLog.count({ where: { action: 'settings.update' } })).toBe(0);
    expect(getSettings()[key as keyof ReturnType<typeof getSettings>]).toBe(
      DEFAULT_SETTINGS[key as keyof ReturnType<typeof getSettings>],
    );
  });

  it('rejects a mixed body as a whole, leaving the permitted key unwritten', async () => {
    const response = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', bearer(chief))
      .send({ lostPersonPurgeHours: 7, longShiftMinutes: 90, silentStationMinutes: 4 });

    expect(response.status).toBe(400);
    expect(response.body.error.details.keys).toEqual(['silentStationMinutes', 'longShiftMinutes']);
    expect(await rawDb.appSetting.count()).toBe(0);
    expect(getSettings().lostPersonPurgeHours).toBe(DEFAULT_SETTINGS.lostPersonPurgeHours);
  });

  it('leaves an existing retired-key row untouched while another key is written', async () => {
    await rawDb.appSetting.create({ data: { key: 'longShiftMinutes', value: 150 } });
    await loadSettings();
    await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', bearer(chief))
      .send({ alertPollSeconds: 12 })
      .expect(200);

    expect(
      (await rawDb.appSetting.findUniqueOrThrow({ where: { key: 'longShiftMinutes' } })).value,
    ).toBe(150);
    expect(await rawDb.appSetting.count()).toBe(2);
  });

  /**
   * The shift hours decide whether a capture screen works at all, because
   * station scoping requires a shift to be running. They are the templates'
   * (ADR-002), and a change has to actually take effect.
   */
  it("moves a template's hours, and the day's shifts with it", async () => {
    const day = await createEventDayToday();
    const { eventId } = await testEvent();
    const template = await rawDb.shiftTemplate.findFirstOrThrow({
      where: { eventId, code: 'MORNING' },
    });
    const response = await request(app)
      .patch(`/api/v1/admin/shift-templates/${template.id}`)
      .set('Authorization', bearer(chief))
      .send({ label: 'Early', startLocal: '06:00', endLocal: '07:00' });

    expect(response.status).toBe(200);
    expect(response.body.template).toMatchObject({ code: 'MORNING', label: 'Early' });
    // Today's shift follows, in the event's timezone.
    const morning = await rawDb.shift.findFirstOrThrow({
      where: { eventId, eventDayId: day.id, templateId: template.id },
    });
    expect(morning.startsAt.toISOString()).toBe('2027-01-06T22:00:00.000Z');
    expect(morning.endsAt.toISOString()).toBe('2027-01-06T23:00:00.000Z');
    const listed = await request(app)
      .get('/api/v1/admin/shift-templates')
      .set('Authorization', bearer(chief));
    expect(listed.body.data.map((row: { label: string }) => row.label)).toEqual([
      'Early',
      'Afternoon',
    ]);
  });

  it('rejects a shift that ends before it starts, and leaves the shifts alone', async () => {
    const day = await createEventDayToday();
    const { eventId } = await testEvent();
    const template = await rawDb.shiftTemplate.findFirstOrThrow({
      where: { eventId, code: 'MORNING' },
    });
    const before = await rawDb.shift.findFirstOrThrow({
      where: { eventId, eventDayId: day.id, templateId: template.id },
    });
    const response = await request(app)
      .patch(`/api/v1/admin/shift-templates/${template.id}`)
      .set('Authorization', bearer(chief))
      .send({ startLocal: '14:00', endLocal: '09:30' });

    expect(response.status).toBe(400);
    const after = await rawDb.shift.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.startsAt).toEqual(before.startsAt);
  });

  it('lists each day with its shifts, so an assignment can name one', async () => {
    await createEventDayToday();
    const response = await request(app)
      .get('/api/v1/admin/event-days')
      .set('Authorization', bearer(chief));
    expect(response.body.data[0].shifts.map((shift: { code: string }) => shift.code)).toEqual([
      'MORNING',
      'AFTERNOON',
    ]);
  });

  it('rejects an unknown setting rather than ignoring it', async () => {
    const response = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', bearer(chief))
      .send({ notASetting: 1 });

    expect(response.status).toBe(400);
  });

  it('audits the change with the previous value', async () => {
    await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', bearer(chief))
      .send({ lostPersonPurgeHours: 12 })
      .expect(200);

    const entry = await prisma.auditLog.findFirst({ where: { action: 'settings.update' } });
    expect(entry?.before).toMatchObject({ lostPersonPurgeHours: 24 });
    expect(entry?.after).toMatchObject({ lostPersonPurgeHours: 12 });
  });
});

describe('stations, days and gifts', () => {
  // The event's own station structure (ADR-002): a type and a tag.
  beforeEach(async () => {
    const { eventId } = await testEvent();
    await rawDb.stationType.create({
      data: { eventId, code: 'COURSE_ROOM', label: 'Course room', countsEntry: true },
    });
    await rawDb.stationTag.create({ data: { eventId, code: 'DCS', label: 'DCS' } });
  });

  it("creates a station of the event's type and tags, and refuses a duplicate code", async () => {
    const created = await request(app)
      .post('/api/v1/admin/stations')
      .set('Authorization', bearer(chief))
      .send({ code: 'NEW_LAB', name: 'New Lab', typeCode: 'COURSE_ROOM', tagCodes: ['DCS'] });

    expect(created.status).toBe(201);
    expect(created.body.station.code).toBe('NEW_LAB');
    // What happens there is the type's (ADR-002), the course a tag.
    expect(created.body.station.type).toMatchObject({
      code: 'COURSE_ROOM',
      registersVisitors: false,
      countsEntry: true,
      issuesStamp: false,
      redeemsGifts: false,
    });
    expect(created.body.station.tags).toEqual([expect.objectContaining({ code: 'DCS' })]);

    const duplicate = await request(app)
      .post('/api/v1/admin/stations')
      .set('Authorization', bearer(chief))
      .send({ code: 'NEW_LAB', name: 'Another', typeCode: 'COURSE_ROOM' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('STATION_CODE_TAKEN');
  });

  it('refuses a type or tag the event does not have', async () => {
    const send = (body: object) =>
      request(app).post('/api/v1/admin/stations').set('Authorization', bearer(chief)).send(body);
    expect((await send({ code: 'NO_TYPE', name: 'X', typeCode: 'NOPE' })).status).toBe(404);
    const noTag = await send({
      code: 'NO_TAG',
      name: 'X',
      typeCode: 'COURSE_ROOM',
      tagCodes: ['NOPE'],
    });
    expect(noTag.status).toBe(404);
    expect(await rawDb.station.count({ where: { code: { in: ['NO_TYPE', 'NO_TAG'] } } })).toBe(0);
  });

  it('will not let a station code be renamed, because imports join on it', async () => {
    const created = await request(app)
      .post('/api/v1/admin/stations')
      .set('Authorization', bearer(chief))
      .send({ code: 'RENAME_ME', name: 'Station', typeCode: 'COURSE_ROOM' })
      .expect(201);

    const response = await request(app)
      .patch(`/api/v1/admin/stations/${created.body.station.id as string}`)
      .set('Authorization', bearer(chief))
      .send({ code: 'SOMETHING_ELSE' });

    expect(response.status).toBe(400);
  });

  it('creates an event day and refuses the same date twice', async () => {
    const created = await request(app)
      .post('/api/v1/admin/event-days')
      .set('Authorization', bearer(chief))
      .send({ date: '2027-01-10', label: 'Extra Day' });

    expect(created.status).toBe(201);
    // A shift per template, at its hours in the event's timezone (P09.5).
    const shifts = await rawDb.shift.findMany({
      where: { eventId: (await testEvent()).eventId, eventDayId: created.body.eventDay.id },
      orderBy: { startsAt: 'asc' },
    });
    expect(shifts.map((shift) => shift.startsAt.toISOString())).toEqual([
      '2027-01-10T01:30:00.000Z',
      '2027-01-10T05:30:00.000Z',
    ]);

    const duplicate = await request(app)
      .post('/api/v1/admin/event-days')
      .set('Authorization', bearer(chief))
      .send({ date: '2027-01-10', label: 'Clash' });

    expect(duplicate.status).toBe(409);
  });

  it('refuses to reopen the initial stock of a gift type', async () => {
    const created = await request(app)
      .post('/api/v1/admin/gift-types')
      .set('Authorization', bearer(chief))
      .send({ name: 'Test Tote', initialStock: 100 })
      .expect(201);

    // Stock is derived. Editing the opening figure after redemptions have
    // started would rewrite history rather than correct it; a miscount is an
    // audited adjustment with a reason.
    const response = await request(app)
      .patch(`/api/v1/admin/gift-types/${created.body.giftType.id as string}`)
      .set('Authorization', bearer(chief))
      .send({ initialStock: 500 });

    expect(response.status).toBe(400);
  });

  it('refuses to delete an assignment somebody already worked', async () => {
    const day = await createEventDayToday();
    const station = await createStation({ code: 'DEL_TEST' });

    const assignment = await rawDb.shiftAssignment.create({
      data: {
        eventId: (await testEvent()).eventId,
        volunteerId: volunteer.id,
        stationId: station.id,
        eventDayId: day.id,
        shiftId: await shiftOn(day.id),
        roleLabel: 'Usher',
        checkedInAt: new Date(),
      },
      select: { id: true },
    });

    const response = await request(app)
      .delete(`/api/v1/admin/assignments/${assignment.id}`)
      .set('Authorization', bearer(chief))
      .send();

    expect(response.status).toBe(409);
  });
});
