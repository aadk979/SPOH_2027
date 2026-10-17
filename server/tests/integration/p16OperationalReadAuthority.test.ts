import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { ROLE_IDS, type Role } from '@spoh/access-policies';
import {
  AnnouncementRecord,
  AuditLogResponse,
  ErrorBody,
  MeResponse,
  MyAssignment,
  ShiftAssignmentRecord,
  VolunteerAdminRecord,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { settleDenials } from '../../src/platform/http/authorizationDenials.js';
import { rawDb } from '../helpers/db.js';
import { bearer, createVolunteer, membershipOf, type TestVolunteer } from '../helpers/fixtures.js';
import { workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';

const app = createApp(),
  forms = ['scoped', 'alias'] as const;
let fixture: WorkspaceFixture, actors: Map<Role, TestVolunteer>, announcementId: string;
const peopleRoles: Role[] = ['DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD', 'ADMIN'];
const auditRoles: Role[] = ['CHIEF_COORDINATOR', 'LEAD', 'ADMIN'];
const labels = {
  'People.Read': 'You cannot see the people in the event in this event.',
  'Audit.Read': 'You cannot read the audit log in this event.',
  'Roster.ReadStation': "You cannot see a station's roster in this event.",
};
type Action = keyof typeof labels;
type Denial = { action: Action; pattern: string; requestId: string; policies: string[] };
beforeEach(async () => {
  fixture = await workspaceFixture();
  actors = new Map<Role, TestVolunteer>([
    ['ADMIN', fixture.admin],
    ['IC', fixture.ic],
    ['VOLUNTEER', fixture.volunteer],
  ]);
  for (const role of ['DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD'] as const)
    actors.set(
      role,
      await createVolunteer({
        email: `synthetic-authority-${role.toLowerCase()}@local.test`,
        role,
      }),
    );
  const sent = await request(app)
    .post('/api/v1/events/' + fixture.eventId + '/announcements')
    .set('Authorization', bearer(fixture.admin))
    .send({
      body: 'Synthetic local read-authority audit marker',
      priority: 'INFO',
      requiresAck: false,
      target: {},
    });
  expect(sent.status).toBe(201);
  announcementId = AnnouncementRecord.parse(sent.body.announcement).id;
  await settleDenials();
});
const prefix = (form: (typeof forms)[number], pattern = false) =>
  form === 'scoped' ? '/api/v1/events/' + (pattern ? ':eventId' : fixture.eventId) : '/api/v1';
async function open(actor: TestVolunteer) {
  const opened = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken: actor.token });
  expect(opened.status).toBe(201);
  expect(opened.body.mfaRequired ?? false).toBe(false);
  expect(typeof opened.body.accessToken).toBe('string');
  return opened.body.accessToken as string;
}
async function business() {
  return {
    people: await rawDb.person.findMany({ orderBy: { id: 'asc' } }),
    memberships: await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } }),
    assignments: await rawDb.shiftAssignment.findMany({ orderBy: { id: 'asc' } }),
    permissions: await rawDb.rolePermission.findMany({
      orderBy: [{ eventId: 'asc' }, { role: 'asc' }, { action: 'asc' }],
    }),
    announcements: await rawDb.announcement.findMany({ orderBy: { id: 'asc' } }),
    acks: await rawDb.announcementAck.findMany({ orderBy: { id: 'asc' } }),
    businessAudits: await rawDb.auditLog.findMany({
      where: { action: { not: 'authorization.denied' } },
      orderBy: { id: 'asc' },
    }),
  };
}
async function get(
  path: string,
  token: string,
  expected: number,
  denial?: { action: Action; pattern: string; policies: string[] },
  records?: Denial[],
) {
  const response = await request(app)
    .get(path)
    .set('Authorization', 'Bearer ' + token);
  expect(response.status, path).toBe(expected);
  if (expected === 200) expect(response.headers['cache-control']).toBe('private, no-store');
  else {
    expect(denial).toBeDefined();
    const error = ErrorBody.parse(response.body).error;
    expect(error).toMatchObject({
      code: 'FORBIDDEN',
      message: labels[denial!.action],
      details: { actions: [denial!.action] },
    });
    expect(
      (response.headers['cache-control'] ?? '').split(',').map((v: string) => v.trim()),
    ).toContain('no-store');
    const requestId = response.body.error.requestId as string;
    expect(typeof requestId).toBe('string');
    records?.push({ ...denial!, requestId });
  }
  await settleDenials();
  return response;
}
async function auditDenials(actor: TestVolunteer, records: Denial[]) {
  await settleDenials();
  const rows = await rawDb.auditLog.findMany({
      where: { action: 'authorization.denied' },
      orderBy: { id: 'asc' },
    }),
    first = [
      ...new Map(
        records
          .slice()
          .reverse()
          .map((r) => [r.pattern, r]),
      ).values(),
    ];
  expect(rows).toHaveLength(first.length);
  const member = await membershipOf(actor.id);
  for (const expected of first) {
    const row = rows.find((r) => r.entityId === 'GET ' + expected.pattern);
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      eventId: fixture.eventId,
      actorId: actor.id,
      membershipId: member.id,
      severity: 'WARNING',
      outcome: 'DENIED',
      entityType: 'Route',
      entityId: 'GET ' + expected.pattern,
      method: 'GET',
      path: expected.pattern,
      statusCode: 403,
      requestId: expected.requestId,
      after: { actions: [expected.action], policies: expected.policies },
    });
  }
}
const roleCases = ROLE_IDS.flatMap((role) => forms.map((form) => ({ role, form })));
it.each(roleCases)(
  '$form $role reads people only with its grant, reads owned audit with its own grant, and retains own shifts',
  async ({ role, form }) => {
    const actor = actors.get(role)!,
      token = await open(actor),
      before = await business(),
      denials: Denial[] = [],
      p = prefix(form),
      pattern = prefix(form, true),
      mayPeople = peopleRoles.includes(role),
      mayAudit = auditRoles.includes(role);
    const listing = await get(
      p + '/admin/volunteers?limit=200',
      token,
      mayPeople ? 200 : 403,
      { action: 'People.Read', pattern: pattern + '/admin/volunteers', policies: [] },
      denials,
    );
    if (mayPeople) {
      const rows = listing.body.data.map((v: unknown) => VolunteerAdminRecord.parse(v));
      expect(rows.map((v: { id: string }) => v.id).sort()).toEqual(
        [...actors.values()].map((v) => v.id).sort(),
      );
      expect(listing.body.meta).toEqual({ count: 6, nextCursor: null });
    }
    const targets = [...new Set([actor.id, fixture.ic.id, fixture.admin.id])];
    for (const id of targets) {
      const response = await get(
        p + '/admin/volunteers/' + id,
        token,
        mayPeople ? 200 : 403,
        { action: 'People.Read', pattern: pattern + '/admin/volunteers/:id', policies: [] },
        denials,
      );
      if (mayPeople) expect(VolunteerAdminRecord.parse(response.body.volunteer).id).toBe(id);
    }
    const audit = await get(
      p + '/audit?entityId=' + announcementId + '&limit=200',
      token,
      mayAudit ? 200 : 403,
      { action: 'Audit.Read', pattern: pattern + '/audit', policies: [] },
      denials,
    );
    if (mayAudit) {
      const body = AuditLogResponse.parse(audit.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        action: 'announcement.send',
        entityId: announcementId,
        actorId: fixture.admin.id,
      });
      expect(body.meta.nextCursor).toBeNull();
    }
    const me = MeResponse.parse((await get(p + '/me', token, 200)).body),
      own = await get(p + '/roster/me', token, 200),
      shifts = own.body.data.map((v: unknown) => MyAssignment.parse(v));
    expect(me.volunteer.id).toBe(actor.id);
    expect(me.volunteer.role).toBe(role);
    expect(shifts).toEqual(me.upcomingAssignments);
    expect(own.body.meta).toEqual({ count: shifts.length, nextCursor: null });
    await auditDenials(actor, denials);
    expect(await business()).toEqual(before);
  },
);
const stationCases = roleCases.flatMap((value) =>
  ['IC_ASSIGNED', 'IC_UNASSIGNED'].map((station) => ({ ...value, station })),
);
it.each(stationCases)(
  '$form $role $station station roster enforces its grant and assigned-station boundary with exact refusal audit',
  async ({ role, form, station }) => {
    const actor = actors.get(role)!,
      token = await open(actor),
      before = await business(),
      denials: Denial[] = [],
      stationId = station === 'IC_ASSIGNED' ? fixture.first : fixture.second;
    const mayRead = role !== 'VOLUNTEER' && (role !== 'IC' || station === 'IC_ASSIGNED'),
      restricted = role === 'IC' || role === 'VOLUNTEER',
      assigned =
        role === 'IC'
          ? station === 'IC_ASSIGNED'
          : role === 'VOLUNTEER'
            ? station === 'IC_UNASSIGNED'
            : false;
    const policies = restricted && !assigned ? ['station-scope.ic-own-stations'] : [];
    const response = await get(
      prefix(form) + '/roster/station/' + stationId + '?eventDayId=' + fixture.dayId,
      token,
      mayRead ? 200 : 403,
      {
        action: 'Roster.ReadStation',
        pattern: prefix(form, true) + '/roster/station/:stationId',
        policies,
      },
      denials,
    );
    if (mayRead) {
      const rows = response.body.data.map((v: unknown) => ShiftAssignmentRecord.parse(v));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        stationId,
        eventDayId: fixture.dayId,
        volunteerId: station === 'IC_ASSIGNED' ? fixture.ic.id : fixture.volunteer.id,
      });
      expect(response.body.meta).toEqual({ count: 1, nextCursor: null });
    }
    await auditDenials(actor, denials);
    expect(await business()).toEqual(before);
  },
);
