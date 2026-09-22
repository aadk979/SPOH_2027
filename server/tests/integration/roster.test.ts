import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseRosterCsv, type RosterImportResponse } from '@spoh/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { loadSettings } from '../../src/lib/settings.js';
import { singaporeDateString } from '../../src/lib/time.js';
import { sensitiveRateLimit } from '../../src/middleware/rateLimit.js';
import { resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * Provisioning and the roster import.
 *
 * The import is the way 200 accounts come to exist, so the tests that matter
 * are the ones about what it refuses to do by accident: demote the Chief who
 * ran it, reinstate somebody who was locked out, mint an Admin for a Deputy,
 * or fall over on the preview because two new people share a placeholder.
 */
const app = createApp();

let admin: TestVolunteer;
let chief: TestVolunteer;
let deputy: TestVolunteer;
let ic: TestVolunteer;
let today: string;
let booth: { id: string; code: string };

async function importRows(
  actor: TestVolunteer,
  rows: unknown[],
  commit = false,
): Promise<{ status: number; body: RosterImportResponse }> {
  const response = await request(app)
    .post('/api/v1/roster/import')
    .set('Authorization', bearer(actor))
    .send({ rows, commit });
  return { status: response.status, body: response.body as RosterImportResponse };
}

beforeEach(async () => {
  await resetDatabase();
  await loadSettings();

  admin = await createVolunteer({ email: 'admin@spoh.test', role: 'ADMIN' });
  chief = await createVolunteer({ email: 'chief@spoh.test', role: 'CHIEF_COORDINATOR' });
  deputy = await createVolunteer({ email: 'deputy@spoh.test', role: 'DEPUTY_COORDINATOR' });
  ic = await createVolunteer({ email: 'ic@spoh.test', role: 'IC', displayName: 'Room A IC' });

  // Provisioning, importing and exporting all sit on the sensitive limit, and
  // this file drives them from the same Chief far more than 20 times a minute.
  for (const person of [admin, chief, deputy, ic]) sensitiveRateLimit.resetKey(`sub:${person.sub}`);

  await createEventDayToday();
  today = singaporeDateString();
  booth = await createStation({ code: 'SIGNUP_BOOTH', name: 'Sign-up booth' });
});

// ─────────────────────────────────────────────────────────────
// PROVISIONING ONE PERSON
// ─────────────────────────────────────────────────────────────

describe('provisioning a volunteer', () => {
  it('creates the roster row and reports whether an identity was minted', async () => {
    const response = await request(app)
      .post('/api/v1/roster/volunteers')
      .set('Authorization', bearer(chief))
      .send({ displayName: 'New Person', email: 'New.Person@spoh.test', phone: '+65 9000 1111' });

    expect(response.status).toBe(201);
    expect(response.body.identityCreated).toBe(true);
    expect(response.body.volunteer).toMatchObject({
      email: 'new.person@spoh.test',
      role: 'VOLUNTEER',
      active: true,
    });

    const audit = await prisma.auditLog.findFirst({ where: { action: 'user.provision' } });
    expect(audit?.entityId).toBe(response.body.volunteer.id);
  });

  it('refuses an email already on the roster, pointing at the existing row', async () => {
    const response = await request(app)
      .post('/api/v1/roster/volunteers')
      .set('Authorization', bearer(chief))
      .send({ displayName: 'Someone Else', email: 'ic@spoh.test' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('VOLUNTEER_EXISTS');
    expect(response.body.error.details).toEqual({ volunteerId: ic.id, active: true });

    // And, crucially, did not quietly demote the IC to the form's default.
    const row = await prisma.volunteer.findUnique({ where: { id: ic.id } });
    expect(row?.role).toBe('IC');
    expect(row?.displayName).toBe('Room A IC');
  });

  it('tells the admin to restore access rather than re-add a deactivated person', async () => {
    await prisma.volunteer.update({
      where: { id: ic.id },
      data: { active: false, deactivatedAt: new Date(), deactivatedReason: 'left' },
    });

    const response = await request(app)
      .post('/api/v1/roster/volunteers')
      .set('Authorization', bearer(chief))
      .send({ displayName: 'Room A IC', email: 'ic@spoh.test' });

    expect(response.status).toBe(409);
    expect(response.body.error.details.active).toBe(false);
    expect(response.body.error.message).toContain('Restore');
  });

  it('will not let a Chief mint an Admin', async () => {
    const response = await request(app)
      .post('/api/v1/roster/volunteers')
      .set('Authorization', bearer(chief))
      .send({ displayName: 'Sneaky', email: 'sneaky@spoh.test', role: 'ADMIN' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_ESCALATION_DENIED');
    expect(await prisma.volunteer.findUnique({ where: { email: 'sneaky@spoh.test' } })).toBeNull();
  });

  it('will not let a Chief mint another Chief either', async () => {
    const response = await request(app)
      .post('/api/v1/roster/volunteers')
      .set('Authorization', bearer(chief))
      .send({ displayName: 'Peer', email: 'peer@spoh.test', role: 'CHIEF_COORDINATOR' });

    expect(response.status).toBe(403);
  });

  it('resolves and validates the manager', async () => {
    const missing = await request(app)
      .post('/api/v1/roster/volunteers')
      .set('Authorization', bearer(chief))
      .send({ displayName: 'A', email: 'a@spoh.test', reportsToEmail: 'nobody@spoh.test' });
    expect(missing.status).toBe(400);

    await prisma.volunteer.update({ where: { id: ic.id }, data: { active: false } });
    const inactive = await request(app)
      .post('/api/v1/roster/volunteers')
      .set('Authorization', bearer(chief))
      .send({ displayName: 'A', email: 'a@spoh.test', reportsToEmail: 'ic@spoh.test' });
    expect(inactive.status).toBe(400);
    expect(inactive.body.error.message).toContain('deactivated');
  });
});

// ─────────────────────────────────────────────────────────────
// IMPORT: PREVIEW
// ─────────────────────────────────────────────────────────────

describe('roster import preview', () => {
  it('previews several new people without writing anything', async () => {
    // Two new people used to collide on a shared placeholder subject and 500
    // the preview — the one request an import always starts with.
    const { status, body } = await importRows(chief, [
      { displayName: 'A', email: 'a@spoh.test' },
      { displayName: 'B', email: 'b@spoh.test' },
      { displayName: 'C', email: 'c@spoh.test', role: 'IC' },
    ]);

    expect(status).toBe(200);
    expect(body.committed).toBe(false);
    expect(body.volunteersCreated).toBe(3);
    expect(body.identitiesCreated).toBe(0);
    expect(body.issues).toEqual([]);
    expect(body.outcomes.map((o) => o.person)).toEqual(['create', 'create', 'create']);

    expect(await prisma.volunteer.count({ where: { email: { in: ['a@spoh.test'] } } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'roster.import' } })).toBe(0);
  });

  it('counts a person with two shifts once, and each shift separately', async () => {
    const { body } = await importRows(chief, [
      {
        displayName: 'A',
        email: 'a@spoh.test',
        stationCode: 'SIGNUP_BOOTH',
        eventDate: today,
        block: 'MORNING',
      },
      {
        displayName: 'A',
        email: 'a@spoh.test',
        stationCode: 'SIGNUP_BOOTH',
        eventDate: today,
        block: 'AFTERNOON',
      },
    ]);

    expect(body.volunteersCreated).toBe(1);
    expect(body.assignmentsCreated).toBe(2);
    expect(body.outcomes.map((o) => o.assignment)).toEqual(['create', 'create']);
  });

  it('reports the rows it cannot roster, and still previews the rest', async () => {
    await createStation({ code: 'CLOSED_ROOM', active: false, name: 'Old Lab' });

    const { body } = await importRows(chief, [
      {
        displayName: 'A',
        email: 'a@spoh.test',
        stationCode: 'NOWHERE',
        eventDate: today,
        block: 'MORNING',
      },
      {
        displayName: 'A',
        email: 'a@spoh.test',
        stationCode: 'CLOSED_ROOM',
        eventDate: today,
        block: 'AFTERNOON',
      },
      {
        displayName: 'B',
        email: 'b@spoh.test',
        stationCode: 'SIGNUP_BOOTH',
        eventDate: '2031-06-01',
        block: 'MORNING',
      },
      { displayName: 'C', email: 'c@spoh.test', stationCode: 'SIGNUP_BOOTH', block: 'MORNING' },
      {
        displayName: 'D',
        email: 'd@spoh.test',
        stationCode: 'SIGNUP_BOOTH',
        eventDate: today,
        block: 'MORNING',
      },
    ]);

    expect(body.volunteersCreated).toBe(4);
    expect(body.assignmentsCreated).toBe(1);
    expect(body.issues.map((i) => [i.rowNumber, i.field])).toEqual([
      [1, 'stationCode'],
      [2, 'stationCode'],
      [3, 'eventDate'],
      [4, 'stationCode/eventDate/block'],
    ]);
    expect(body.issues[1]?.message).toContain('closed');
    expect(body.outcomes.map((o) => o.assignment)).toEqual([
      'skip',
      'skip',
      'skip',
      'skip',
      'create',
    ]);
  });

  it('flags the same shift given twice in one file and keeps the first', async () => {
    await createStation({ code: 'ROOM_B' });

    const { body } = await importRows(chief, [
      {
        displayName: 'A',
        email: 'a@spoh.test',
        stationCode: 'SIGNUP_BOOTH',
        eventDate: today,
        block: 'MORNING',
      },
      {
        displayName: 'A',
        email: 'a@spoh.test',
        stationCode: 'ROOM_B',
        eventDate: today,
        block: 'MORNING',
      },
    ]);

    expect(body.assignmentsCreated).toBe(1);
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0]).toMatchObject({ rowNumber: 2, field: 'block' });
  });

  it('reports a later row that disagrees about who somebody is', async () => {
    const { body } = await importRows(chief, [
      { displayName: 'Alice', email: 'a@spoh.test', role: 'IC' },
      { displayName: 'Alicia', email: 'a@spoh.test', role: 'VOLUNTEER', phone: '91234567' },
    ]);

    expect(body.volunteersCreated).toBe(1);
    expect(body.issues.map((i) => [i.rowNumber, i.field])).toEqual([
      [2, 'displayName'],
      [2, 'role'],
    ]);
  });
});

// ─────────────────────────────────────────────────────────────
// IMPORT: COMMIT
// ─────────────────────────────────────────────────────────────

describe('roster import commit', () => {
  it('creates people and shifts, writes one audit row, and is idempotent', async () => {
    const rows = [
      {
        displayName: 'Lead A',
        email: 'a@spoh.test',
        role: 'IC',
        stationCode: 'SIGNUP_BOOTH',
        eventDate: today,
        block: 'MORNING',
        roleLabel: 'Station IC',
      },
      {
        displayName: 'Vol B',
        email: 'b@spoh.test',
        reportsToEmail: 'a@spoh.test',
        stationCode: 'SIGNUP_BOOTH',
        eventDate: today,
        block: 'MORNING',
      },
    ];

    const first = await importRows(chief, rows, true);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      committed: true,
      volunteersCreated: 2,
      volunteersUpdated: 0,
      assignmentsCreated: 2,
      identitiesCreated: 2,
    });

    const b = await prisma.volunteer.findUnique({
      where: { email: 'b@spoh.test' },
      include: { reportsTo: true, shiftAssignments: true },
    });
    expect(b?.role).toBe('VOLUNTEER');
    expect(b?.reportsTo?.email).toBe('a@spoh.test');
    expect(b?.shiftAssignments).toHaveLength(1);
    expect(b?.cognitoSub.startsWith('local:')).toBe(true);

    expect(await prisma.auditLog.count({ where: { action: 'roster.import' } })).toBe(1);

    // The same file again: nothing new, nothing duplicated.
    const second = await importRows(chief, rows, true);
    expect(second.body).toMatchObject({
      volunteersCreated: 0,
      volunteersUpdated: 2,
      assignmentsCreated: 0,
      assignmentsUpdated: 2,
    });
    expect(await prisma.shiftAssignment.count()).toBe(2);
  });

  it('resolves a manager who is on the roster but not in the file', async () => {
    const { body } = await importRows(
      chief,
      [{ displayName: 'B', email: 'b@spoh.test', reportsToEmail: 'ic@spoh.test' }],
      true,
    );

    expect(body.issues).toEqual([]);
    const b = await prisma.volunteer.findUnique({ where: { email: 'b@spoh.test' } });
    expect(b?.reportsToId).toBe(ic.id);
  });

  it('catches a reporting loop that exists only between two rows of the file', async () => {
    const { body } = await importRows(chief, [
      { displayName: 'A', email: 'a@spoh.test', reportsToEmail: 'b@spoh.test' },
      { displayName: 'B', email: 'b@spoh.test', reportsToEmail: 'a@spoh.test' },
    ]);

    expect(body.issues).toHaveLength(1);
    expect(body.issues[0]).toMatchObject({ rowNumber: 2, field: 'reportsToEmail' });
    expect(body.issues[0]?.message).toContain('loop');
  });

  it('leaves the role alone when the file does not mention one', async () => {
    // A shift list — name, email, station, day, block — must not demote the IC.
    const { body } = await importRows(
      chief,
      [
        {
          displayName: 'Room A IC',
          email: 'ic@spoh.test',
          stationCode: 'SIGNUP_BOOTH',
          eventDate: today,
          block: 'MORNING',
        },
      ],
      true,
    );

    expect(body.volunteersUpdated).toBe(1);
    const row = await prisma.volunteer.findUnique({ where: { id: ic.id } });
    expect(row?.role).toBe('IC');
  });

  it('signs out somebody whose role it changed', async () => {
    await request(app).post('/api/v1/auth/session').send({ email: 'ic@spoh.test' }).expect(201);

    await importRows(
      chief,
      [{ displayName: 'Room A IC', email: 'ic@spoh.test', role: 'VOLUNTEER' }],
      true,
    );

    const live = await prisma.refreshSession.count({
      where: { volunteerId: ic.id, revokedAt: null },
    });
    expect(live).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// IMPORT: WHAT IT REFUSES
// ─────────────────────────────────────────────────────────────

describe('roster import refusals', () => {
  it('skips the row for the person running it', async () => {
    const { body } = await importRows(
      chief,
      [{ displayName: 'Chief', email: 'chief@spoh.test', role: 'VOLUNTEER' }],
      true,
    );

    expect(body.volunteersSkipped).toBe(1);
    expect(body.outcomes[0]?.person).toBe('skip');
    expect(body.issues[0]?.message).toContain('your own account');

    const row = await prisma.volunteer.findUnique({ where: { id: chief.id } });
    expect(row?.role).toBe('CHIEF_COORDINATOR');
  });

  it('skips anyone at or above the caller, and any row that would grant such a role', async () => {
    const { body } = await importRows(
      chief,
      [
        { displayName: 'Admin', email: 'admin@spoh.test', role: 'VOLUNTEER' },
        { displayName: 'Peer', email: 'peer@spoh.test', role: 'CHIEF_COORDINATOR' },
        { displayName: 'Room A IC', email: 'ic@spoh.test', role: 'ADMIN' },
        { displayName: 'Fine', email: 'fine@spoh.test', role: 'DEPUTY_COORDINATOR' },
      ],
      true,
    );

    expect(body.volunteersSkipped).toBe(3);
    expect(body.volunteersCreated).toBe(1);
    expect(body.issues.map((i) => i.rowNumber)).toEqual([1, 2, 3]);

    expect((await prisma.volunteer.findUnique({ where: { id: admin.id } }))?.role).toBe('ADMIN');
    expect((await prisma.volunteer.findUnique({ where: { id: ic.id } }))?.role).toBe('IC');
    expect(await prisma.volunteer.findUnique({ where: { email: 'peer@spoh.test' } })).toBeNull();
  });

  it('still rosters a person it may not edit', async () => {
    // A Chief cannot change an Admin's account, but can put them on a shift:
    // that is roster editing, which the Chief holds.
    const { body } = await importRows(
      chief,
      [
        {
          displayName: 'Admin',
          email: 'admin@spoh.test',
          stationCode: 'SIGNUP_BOOTH',
          eventDate: today,
          block: 'MORNING',
        },
      ],
      true,
    );

    expect(body.outcomes[0]).toMatchObject({ person: 'skip', assignment: 'create' });
    expect(await prisma.shiftAssignment.count({ where: { volunteerId: admin.id } })).toBe(1);
  });

  it('does not reinstate a deactivated person, nor roster them', async () => {
    await prisma.volunteer.update({
      where: { id: ic.id },
      data: { active: false, deactivatedAt: new Date(), deactivatedReason: 'lost phone' },
    });

    const { body } = await importRows(
      chief,
      [
        {
          displayName: 'Room A IC',
          email: 'ic@spoh.test',
          stationCode: 'SIGNUP_BOOTH',
          eventDate: today,
          block: 'MORNING',
        },
      ],
      true,
    );

    expect(body.outcomes[0]).toEqual({
      rowNumber: 1,
      email: 'ic@spoh.test',
      person: 'skip',
      assignment: 'skip',
    });
    expect(body.issues[0]?.message).toContain('lost phone');

    const row = await prisma.volunteer.findUnique({ where: { id: ic.id } });
    expect(row?.active).toBe(false);
    expect(await prisma.shiftAssignment.count({ where: { volunteerId: ic.id } })).toBe(0);
  });

  it('lets a Deputy roster people who exist but not create ones who do not', async () => {
    const { body } = await importRows(
      deputy,
      [
        {
          displayName: 'Room A IC',
          email: 'ic@spoh.test',
          stationCode: 'SIGNUP_BOOTH',
          eventDate: today,
          block: 'MORNING',
        },
        {
          displayName: 'Newcomer',
          email: 'new@spoh.test',
          stationCode: 'SIGNUP_BOOTH',
          eventDate: today,
          block: 'MORNING',
        },
      ],
      true,
    );

    expect(body.outcomes).toEqual([
      { rowNumber: 1, email: 'ic@spoh.test', person: 'update', assignment: 'create' },
      { rowNumber: 2, email: 'new@spoh.test', person: 'skip', assignment: 'skip' },
    ]);
    expect(body.issues[0]?.message).toContain('only a Chief Coordinator or Admin');
    expect(await prisma.volunteer.findUnique({ where: { email: 'new@spoh.test' } })).toBeNull();
  });

  it('rejects a malformed row up front rather than importing around it', async () => {
    const { status } = await importRows(chief, [{ displayName: 'A', email: 'not-an-email' }]);
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────
// RESEND INVITE, DETAIL AND EXPORT
// ─────────────────────────────────────────────────────────────

describe('resending an invite', () => {
  it('reports what was sent and leaves an audit row', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/volunteers/${ic.id}/resend-invite`)
      .set('Authorization', bearer(chief));

    expect(response.status).toBe(200);
    // The local provider has no email to send.
    expect(response.body.delivery).toBe('none');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'user.resendInvite' } });
    expect(audit?.entityId).toBe(ic.id);
  });

  it('applies the escalation rules, because a reset locks the target out', async () => {
    const up = await request(app)
      .post(`/api/v1/admin/volunteers/${admin.id}/resend-invite`)
      .set('Authorization', bearer(chief));
    expect(up.status).toBe(403);

    const self = await request(app)
      .post(`/api/v1/admin/volunteers/${chief.id}/resend-invite`)
      .set('Authorization', bearer(chief));
    expect(self.body.error.code).toBe('SELF_MUTATION_DENIED');
  });

  it('refuses for a deactivated account', async () => {
    await prisma.volunteer.update({ where: { id: ic.id }, data: { active: false } });

    const response = await request(app)
      .post(`/api/v1/admin/volunteers/${ic.id}/resend-invite`)
      .set('Authorization', bearer(chief));

    expect(response.status).toBe(409);
  });
});

describe('volunteer detail and export', () => {
  it('returns the shifts a person holds', async () => {
    await importRows(
      chief,
      [
        {
          displayName: 'Room A IC',
          email: 'ic@spoh.test',
          stationCode: 'SIGNUP_BOOTH',
          eventDate: today,
          block: 'AFTERNOON',
          roleLabel: 'Station IC',
        },
      ],
      true,
    );

    const response = await request(app)
      .get(`/api/v1/admin/volunteers/${ic.id}`)
      .set('Authorization', bearer(deputy));

    expect(response.status).toBe(200);
    expect(response.body.volunteer.id).toBe(ic.id);
    expect(response.body.assignments).toHaveLength(1);
    expect(response.body.assignments[0]).toMatchObject({
      stationId: booth.id,
      block: 'AFTERNOON',
      roleLabel: 'Station IC',
    });
  });

  it('exports a file the import reads back, one row per shift', async () => {
    await importRows(
      chief,
      [
        {
          displayName: 'Room A IC',
          email: 'ic@spoh.test',
          stationCode: 'SIGNUP_BOOTH',
          eventDate: today,
          block: 'MORNING',
        },
        {
          displayName: 'Room A IC',
          email: 'ic@spoh.test',
          stationCode: 'SIGNUP_BOOTH',
          eventDate: today,
          block: 'AFTERNOON',
        },
      ],
      true,
    );
    await prisma.volunteer.update({ where: { id: deputy.id }, data: { active: false } });

    const response = await request(app)
      .get('/api/v1/admin/volunteers/export.csv')
      .set('Authorization', bearer(chief));

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');

    const parsed = parseRosterCsv(response.text);
    expect(parsed.errors).toEqual([]);

    const emails = parsed.rows.map((r) => r.row.email);
    expect(emails.filter((e) => e === 'ic@spoh.test')).toHaveLength(2);
    expect(emails).toContain('chief@spoh.test');
    expect(emails).not.toContain('deputy@spoh.test');

    const shift = parsed.rows.find((r) => r.row.email === 'ic@spoh.test');
    expect(shift?.row).toMatchObject({
      stationCode: 'SIGNUP_BOOTH',
      eventDate: today,
      block: 'MORNING',
    });
  });

  it('keeps the export away from an IC', async () => {
    const response = await request(app)
      .get('/api/v1/admin/volunteers/export.csv')
      .set('Authorization', bearer(ic));
    expect(response.status).toBe(403);
  });
});
