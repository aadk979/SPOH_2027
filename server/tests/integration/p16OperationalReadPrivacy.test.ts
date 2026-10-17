import { randomUUID } from 'node:crypto';
import { FROZEN_NOW } from '../setup.js';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import {
  MyEventsResponse,
  AnnouncementRecord,
  AuditLogResponse,
  MeResponse,
  MyAssignment,
  ShiftAssignmentRecord,
  VolunteerAdminRecord,
  IncidentRecord,
  ActiveLostPersonResponse,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb } from '../helpers/db.js';
import { bearer, createVolunteer, membershipOf } from '../helpers/fixtures.js';
import { workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
const app = createApp();
let fixture: WorkspaceFixture, incidentId: string, lostId: string, ownAssignmentId: string;
beforeEach(async () => {
  fixture = await workspaceFixture();
  ownAssignmentId = (
    await rawDb.shiftAssignment.findFirstOrThrow({
      where: { eventId: fixture.eventId, volunteerId: fixture.ic.id },
    })
  ).id;
  const admin = await membershipOf(fixture.admin.id),
    ic = await membershipOf(fixture.ic.id);
  await rawDb.person.update({ where: { id: fixture.ic.id }, data: { phone: '00000000' } });
  const incident = await rawDb.incident.create({
    data: {
      eventId: fixture.eventId,
      type: 'OTHER',
      severity: 'LOW',
      stationId: fixture.first,
      description: 'Synthetic operational incident description',
      reportedById: fixture.admin.id,
      reportedByMembershipId: admin.id,
      occurredAt: FROZEN_NOW,
      reportedAt: FROZEN_NOW,
      idempotencyKey: randomUUID(),
    },
  });
  incidentId = incident.id;
  await rawDb.incidentFollowUp.create({
    data: {
      eventId: fixture.eventId,
      rehearsal: false,
      incidentId,
      note: 'Synthetic internal follow-up note',
      authorId: fixture.ic.id,
      authorMembershipId: ic.id,
      createdAt: FROZEN_NOW,
    },
  });
  const lost = await rawDb.lostPersonAlert.create({
    data: {
      eventId: fixture.eventId,
      descriptionText: 'Synthetic transient search description',
      clothingText: 'Synthetic clothing marker',
      lastSeenStationId: fixture.first,
      lastSeenAt: FROZEN_NOW,
      raisedById: fixture.admin.id,
      raisedByMembershipId: admin.id,
      raisedAt: FROZEN_NOW,
    },
  });
  lostId = lost.id;
  await rawDb.lostPersonAck.create({
    data: {
      eventId: fixture.eventId,
      rehearsal: false,
      alertId: lostId,
      volunteerId: fixture.admin.id,
      membershipId: admin.id,
      ackedAt: FROZEN_NOW,
    },
  });
});
async function snapshot() {
  return {
    people: await rawDb.person.findMany({ orderBy: { id: 'asc' } }),
    assignments: await rawDb.shiftAssignment.findMany({ orderBy: { id: 'asc' } }),
    incidents: await rawDb.incident.findMany({ orderBy: { id: 'asc' } }),
    incidentFollowUps: await rawDb.incidentFollowUp.findMany({ orderBy: { id: 'asc' } }),
    alerts: await rawDb.lostPersonAlert.findMany({ orderBy: { id: 'asc' } }),
    alertAcks: await rawDb.lostPersonAck.findMany({ orderBy: { id: 'asc' } }),
    events: await rawDb.event.findMany({ orderBy: { id: 'asc' } }),
    memberships: await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
    announcements: await rawDb.announcement.findMany({ orderBy: { id: 'asc' } }),
    acknowledgements: await rawDb.announcementAck.findMany({ orderBy: { id: 'asc' } }),
  };
}
it('keeps per-person event membership, role and status responses private without mutating rows', async () => {
  const original = await rawDb.event.findUniqueOrThrow({ where: { id: fixture.eventId } });
  const second = await rawDb.event.create({
    data: {
      organisationId: original.organisationId,
      slug: 'synthetic-private-picker-second',
      name: 'Synthetic private picker second',
      timezone: original.timezone,
      locale: original.locale,
      dayBoundaryMinutes: original.dayBoundaryMinutes,
    },
  });
  await rawDb.eventMembership.create({
    data: { eventId: second.id, personId: fixture.admin.id, role: 'VOLUNTEER' },
  });
  const before = await snapshot(),
    root = await request(app).get('/api/v1/events').set('Authorization', bearer(fixture.admin)),
    peer = await request(app).get('/api/v1/events').set('Authorization', bearer(fixture.ic));
  expect(root.status).toBe(200);
  expect(peer.status).toBe(200);
  const own = MyEventsResponse.parse(root.body),
    other = MyEventsResponse.parse(peer.body);
  expect(own.data.map((row) => row.id).sort()).toEqual([fixture.eventId, second.id].sort());
  expect(other.data.map((row) => row.id)).toEqual([fixture.eventId]);
  expect(own.data.find((row) => row.id === fixture.eventId)?.role).toBe('ADMIN');
  expect(own.data.find((row) => row.id === second.id)?.role).toBe('VOLUNTEER');
  expect(other.data[0]?.role).toBe('IC');
  expect(await snapshot()).toEqual(before);
  expect(root.headers['cache-control']).toBe('private, no-store');
  expect(peer.headers['cache-control']).toBe('private, no-store');
});
it('allows a provisioned person with no memberships an empty private picker response', async () => {
  const person = await createVolunteer({
    email: 'synthetic-no-memberships@picker.test',
    role: 'VOLUNTEER',
  });
  await rawDb.eventMembership.deleteMany({ where: { personId: person.id } });
  const before = await snapshot(),
    response = await request(app).get('/api/v1/events').set('Authorization', bearer(person));
  expect(response.status).toBe(200);
  expect(MyEventsResponse.parse(response.body).data).toEqual([]);
  expect(await snapshot()).toEqual(before);
  expect(response.headers['cache-control']).toBe('private, no-store');
});

it.each(['scoped', 'alias'])(
  '%s event audit actor names and mutation snapshots stay private while reads preserve rows',
  async (form) => {
    const base = '/api/v1/events/' + fixture.eventId,
      created = await request(app)
        .post(base + '/announcements')
        .set('Authorization', bearer(fixture.admin))
        .send({
          body: 'Synthetic local audit privacy marker',
          priority: 'INFO',
          requiresAck: false,
          target: {},
        });
    expect(created.status).toBe(201);
    const announcement = AnnouncementRecord.parse(created.body.announcement),
      before = await snapshot();
    const response = await request(app)
      .get((form === 'scoped' ? base : '/api/v1') + '/audit')
      .set('Authorization', bearer(fixture.admin))
      .query({ entityId: announcement.id, limit: '200' });
    expect(response.status).toBe(200);
    const page = AuditLogResponse.parse(response.body);
    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.action).toBe('announcement.send');
    expect(page.data[0]?.actorId).toBe(fixture.admin.id);
    expect(page.data[0]?.actorName).toBe(fixture.admin.email);
    expect(page.data[0]?.after).toMatchObject({ priority: 'INFO', requiresAck: false });
    expect(page.meta.nextCursor).toBeNull();
    expect(await snapshot()).toEqual(before);
    expect(response.headers['cache-control']).toBe('private, no-store');
  },
);

const surfaces = [
  'me',
  'own-roster',
  'station-roster',
  'people-list',
  'person-detail',
  'incidents',
  'lost-active',
] as const;
it.each(surfaces.flatMap((surface) => ['scoped', 'alias'].map((form) => ({ surface, form }))))(
  '$form $surface operational read retains sensitive data only under no-store',
  async ({ surface, form }) => {
    const prefix = form === 'scoped' ? '/api/v1/events/' + fixture.eventId : '/api/v1',
      paths = {
        me: '/me',
        'own-roster': '/roster/me',
        'station-roster': '/roster/station/' + fixture.first + '?eventDayId=' + fixture.dayId,
        'people-list': '/admin/volunteers',
        'person-detail': '/admin/volunteers/' + fixture.ic.id,
        incidents: '/incidents',
        'lost-active': '/lost-person/active',
      },
      actor = surface === 'me' || surface === 'own-roster' ? fixture.ic : fixture.admin,
      before = await snapshot(),
      response = await request(app)
        .get(prefix + paths[surface])
        .set('Authorization', bearer(actor));
    expect(response.status).toBe(200);
    if (surface === 'me') {
      const body = MeResponse.parse(response.body);
      expect(body.volunteer.id).toBe(fixture.ic.id);
      expect(body.currentAssignment).not.toBeNull();
    } else if (surface === 'own-roster') {
      const rows = response.body.data.map((row: unknown) => MyAssignment.parse(row));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(ownAssignmentId);
      expect(rows[0]?.station.id).toBe(fixture.first);
      expect(rows[0]?.eventDayId).toBe(fixture.dayId);
    } else if (surface === 'station-roster') {
      const rows = response.body.data.map((row: unknown) => ShiftAssignmentRecord.parse(row));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.volunteerId).toBe(fixture.ic.id);
      expect(rows[0]?.volunteerPhone).toBe('00000000');
    } else if (surface === 'people-list') {
      const rows = response.body.data.map((row: unknown) => VolunteerAdminRecord.parse(row));
      expect(rows.map((row: { id: string }) => row.id).sort()).toEqual(
        [fixture.admin.id, fixture.ic.id, fixture.volunteer.id].sort(),
      );
    } else if (surface === 'person-detail') {
      const person = VolunteerAdminRecord.parse(response.body.volunteer);
      expect(person.id).toBe(fixture.ic.id);
      expect(person.phone).toBe('00000000');
    } else if (surface === 'incidents') {
      const rows = response.body.data.map((row: unknown) => IncidentRecord.parse(row));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(incidentId);
      expect(rows[0]?.description).toBe('Synthetic operational incident description');
      expect(rows[0]?.followUps[0]?.note).toBe('Synthetic internal follow-up note');
    } else {
      const body = ActiveLostPersonResponse.parse(response.body);
      expect(body.alerts).toHaveLength(1);
      expect(body.alerts[0]?.id).toBe(lostId);
      expect(body.alerts[0]?.descriptionText).toBe('Synthetic transient search description');
      expect(body.alerts[0]?.ackedByMe).toBe(true);
    }
    expect(await snapshot()).toEqual(before);
    expect(
      (response.headers['cache-control'] ?? '').split(',').map((value: string) => value.trim()),
    ).toContain('no-store');
  },
);
