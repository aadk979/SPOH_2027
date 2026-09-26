import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/platform/db/client.js';
import { getSettings, loadSettings } from '../../src/platform/settings/index.js';
import { resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
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
        endpoint: 'https://push.example/abc',
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

    await prisma.registration.create({
      data: {
        category: 'SEC_4',
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
    expect(await prisma.registration.count({ where: { recordedById: volunteer.id } })).toBe(1);
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
      .send({ silentStationMinutes: 5 });

    expect(response.status).toBe(403);
  });

  it('stores an override and reports which keys are no longer defaults', async () => {
    const response = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', bearer(chief))
      .send({ silentStationMinutes: 5 });

    expect(response.status).toBe(200);
    expect(response.body.settings.silentStationMinutes).toBe(5);
    expect(response.body.overriddenKeys).toContain('silentStationMinutes');
    expect(getSettings().silentStationMinutes).toBe(5);
  });

  /**
   * The shift boundaries decide whether a capture screen works at all, because
   * station scoping requires a block to be running. This is the setting whose
   * change has to actually take effect.
   */
  it('applies a changed shift boundary to the running server', async () => {
    await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', bearer(chief))
      .send({
        shiftBlocks: {
          MORNING: { start: '06:00', end: '07:00' },
          AFTERNOON: { start: '19:00', end: '20:00' },
        },
      })
      .expect(200);

    expect(getSettings().shiftBlocks.MORNING.start).toBe('06:00');
  });

  it('rejects a shift block that ends before it starts', async () => {
    const response = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', bearer(chief))
      .send({
        shiftBlocks: {
          MORNING: { start: '14:00', end: '09:30' },
          AFTERNOON: { start: '13:30', end: '18:00' },
        },
      });

    expect(response.status).toBe(400);
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
      .send({ longShiftMinutes: 120 })
      .expect(200);

    const entry = await prisma.auditLog.findFirst({ where: { action: 'settings.update' } });
    expect(entry?.before).toMatchObject({ longShiftMinutes: 180 });
    expect(entry?.after).toMatchObject({ longShiftMinutes: 120 });
  });
});

describe('stations, days and gifts', () => {
  it('creates a station and refuses a duplicate code', async () => {
    const created = await request(app)
      .post('/api/v1/admin/stations')
      .set('Authorization', bearer(chief))
      .send({ code: 'NEW_LAB', name: 'New Lab', kind: 'COURSE_STATION', countsEntry: true });

    expect(created.status).toBe(201);
    expect(created.body.station.code).toBe('NEW_LAB');

    const duplicate = await request(app)
      .post('/api/v1/admin/stations')
      .set('Authorization', bearer(chief))
      .send({ code: 'NEW_LAB', name: 'Another', kind: 'OTHER' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('STATION_CODE_TAKEN');
  });

  it('will not let a station code be renamed, because imports join on it', async () => {
    const created = await request(app)
      .post('/api/v1/admin/stations')
      .set('Authorization', bearer(chief))
      .send({ code: 'RENAME_ME', name: 'Station', kind: 'OTHER' })
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

    const assignment = await prisma.shiftAssignment.create({
      data: {
        volunteerId: volunteer.id,
        stationId: station.id,
        eventDayId: day.id,
        block: 'MORNING',
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
