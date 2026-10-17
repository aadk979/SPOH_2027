import { randomUUID } from 'node:crypto';
import { FROZEN_NOW } from '../setup.js';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AnnouncementRecord,
  AuditLogResponse,
  AuditQuery,
  ErrorBody,
  ERROR_CODES,
  Id,
  IncidentRecord,
  ListIncidentsQuery,
  ListVolunteersQuery,
  ShiftAssignmentRecord,
  VolunteerAdminRecord,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb } from '../helpers/db.js';
import { bearer, membershipOf } from '../helpers/fixtures.js';
import { workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
import {
  operationalReadQueryCases,
  type QueryFamily,
  type QueryTransport,
} from '../helpers/p16OperationalReadQueryCases.js';
const app = createApp();
let fixture: WorkspaceFixture, announcementId: string;
const schemas = {
  people: ListVolunteersQuery,
  audit: AuditQuery,
  incidents: ListIncidentsQuery,
  'station-roster': z.object({ eventDayId: Id.optional() }).strict(),
};
beforeEach(async () => {
  fixture = await workspaceFixture();
  const response = await request(app)
    .post('/api/v1/events/' + fixture.eventId + '/announcements')
    .set('Authorization', bearer(fixture.admin))
    .send({
      body: 'Synthetic local query-field audit marker',
      priority: 'INFO',
      requiresAck: false,
      target: {},
    });
  expect(response.status).toBe(201);
  announcementId = AnnouncementRecord.parse(response.body.announcement).id;
});
const queryString = (query: QueryTransport) => {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    for (const item of Array.isArray(value) ? value : [value]) q.append(key, item);
  return q.toString();
};
async function snapshot() {
  return {
    people: await rawDb.person.findMany({ orderBy: { id: 'asc' } }),
    memberships: await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } }),
    assignments: await rawDb.shiftAssignment.findMany({ orderBy: { id: 'asc' } }),
    incidents: await rawDb.incident.findMany({ orderBy: { id: 'asc' } }),
    followUps: await rawDb.incidentFollowUp.findMany({ orderBy: { id: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
    announcements: await rawDb.announcement.findMany({ orderBy: { id: 'asc' } }),
    acks: await rawDb.announcementAck.findMany({ orderBy: { id: 'asc' } }),
  };
}
const families: QueryFamily[] = ['people', 'audit', 'incidents', 'station-roster'];
it.each(families.flatMap((family) => ['scoped', 'alias'].map((form) => ({ family, form }))))(
  '$form $family validates every declared URL query field and preserves rows',
  async ({ family, form }) => {
    const corpus = operationalReadQueryCases({
        stationId: fixture.first,
        eventDayId: fixture.dayId,
        personId: fixture.admin.id,
        announcementId,
        now: FROZEN_NOW.toISOString(),
      }),
      prefix = form === 'scoped' ? '/api/v1/events/' + fixture.eventId : '/api/v1',
      paths = {
        people: '/admin/volunteers',
        audit: '/audit',
        incidents: '/incidents',
        'station-roster': '/roster/station/' + fixture.first,
      },
      path = prefix + paths[family],
      before = await snapshot(),
      invalid = corpus.invalid.filter((row) => row.family === family),
      valid = corpus.valid.filter((row) => row.family === family);
    expect(invalid.length).toBeGreaterThan(0);
    expect(valid.length).toBeGreaterThan(0);
    for (const row of valid) {
      expect(schemas[family].safeParse(row.query).success, row.id).toBe(true);
      const response = await request(app)
        .get(path + '?' + queryString(row.query))
        .set('Authorization', bearer(fixture.admin));
      expect(response.status, row.id).toBe(200);
      expect(response.headers['cache-control'], row.id).toBe('private, no-store');
      if (family === 'audit') {
        const body = AuditLogResponse.parse(response.body);
        if (row.id === 'audit:known-message-audit') {
          expect(body.data).toHaveLength(1);
          expect(body.data[0]?.entityId).toBe(announcementId);
          expect(body.data[0]?.action).toBe('announcement.send');
        }
      } else if (family === 'people') {
        const people = response.body.data.map((item: unknown) => VolunteerAdminRecord.parse(item));
        if (row.id === 'people:literal-false') expect(people).toEqual([]);
        if (row.id === 'people:literal-true') expect(people).toHaveLength(3);
        if (row.id === 'people:role-IC') {
          expect(people).toHaveLength(1);
          expect(people[0]?.id).toBe(fixture.ic.id);
        }
      } else if (family === 'incidents')
        response.body.data.forEach((item: unknown) => IncidentRecord.parse(item));
      else {
        const roster = response.body.data.map((item: unknown) => ShiftAssignmentRecord.parse(item));
        expect(roster).toHaveLength(1);
        expect(roster[0]?.volunteerId).toBe(fixture.ic.id);
      }
    }
    for (const row of invalid) {
      expect(schemas[family].safeParse(row.query).success, row.id).toBe(false);
      const response = await request(app)
        .get(path + '?' + queryString(row.query))
        .set('Authorization', bearer(fixture.admin));
      expect(response.status, row.id).toBe(400);
      expect(ErrorBody.parse(response.body).error.code, row.id).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(
        (response.headers['cache-control'] ?? '').split(',').map((v: string) => v.trim()),
        row.id,
      ).toContain('no-store');
    }
    expect(await snapshot()).toEqual(before);
  },
);

it.each(['scoped', 'alias'])(
  '%s nonempty incident filters use reported time and complete tied keyset pages without mutation',
  async (form) => {
    const member = await membershipOf(fixture.admin.id),
      now = FROZEN_NOW.getTime();
    const seeds = [
      { ms: -1, status: 'OPEN', severity: 'LOW', stationId: fixture.first },
      { ms: 0, status: 'ACKNOWLEDGED', severity: 'MEDIUM', stationId: fixture.first },
      { ms: 0, status: 'RESOLVED', severity: 'HIGH', stationId: fixture.second },
      { ms: 1, status: 'OPEN', severity: 'CRITICAL', stationId: fixture.second },
    ] as const;
    const rows: Array<{ id: string }> = [];
    for (const seed of seeds)
      rows.push(
        await rawDb.incident.create({
          data: {
            eventId: fixture.eventId,
            type: 'OTHER',
            severity: seed.severity,
            status: seed.status,
            stationId: seed.stationId,
            description: 'Synthetic nonempty query boundary incident',
            reportedById: fixture.admin.id,
            reportedByMembershipId: member.id,
            occurredAt: new Date(now - 3600000),
            reportedAt: new Date(now + seed.ms),
            idempotencyKey: randomUUID(),
          },
        }),
      );
    const [older, middleA, middleB, newer] = rows.map((row) => row.id);
    expect(older).toBeDefined();
    expect(middleA).toBeDefined();
    expect(middleB).toBeDefined();
    expect(newer).toBeDefined();
    const ids = rows.map((row) => row.id),
      path = (form === 'scoped' ? '/api/v1/events/' + fixture.eventId : '/api/v1') + '/incidents',
      before = await snapshot();
    const cases: Array<{ id: string; query: QueryTransport; ids: Array<string | undefined> }> = [
      { id: 'all', query: {}, ids },
      { id: 'open', query: { status: 'OPEN' }, ids: [older, newer] },
      { id: 'acknowledged', query: { status: 'ACKNOWLEDGED' }, ids: [middleA] },
      { id: 'resolved', query: { status: 'RESOLVED' }, ids: [middleB] },
      { id: 'low', query: { severity: 'LOW' }, ids: [older] },
      { id: 'medium', query: { severity: 'MEDIUM' }, ids: [middleA] },
      { id: 'high', query: { severity: 'HIGH' }, ids: [middleB] },
      { id: 'critical', query: { severity: 'CRITICAL' }, ids: [newer] },
      { id: 'first-station', query: { stationId: fixture.first }, ids: [older, middleA] },
      { id: 'second-station', query: { stationId: fixture.second }, ids: [middleB, newer] },
      {
        id: 'inclusive-from',
        query: { from: FROZEN_NOW.toISOString() },
        ids: [middleA, middleB, newer],
      },
      { id: 'exclusive-to', query: { to: FROZEN_NOW.toISOString() }, ids: [older] },
      {
        id: 'half-open-single-instant',
        query: { from: FROZEN_NOW.toISOString(), to: new Date(now + 1).toISOString() },
        ids: [middleA, middleB],
      },
    ];
    for (const item of cases) {
      const response = await request(app)
        .get(path + '?' + queryString(item.query))
        .set('Authorization', bearer(fixture.admin));
      expect(response.status, item.id).toBe(200);
      const records = response.body.data.map((row: unknown) => IncidentRecord.parse(row));
      expect(records.map((row: { id: string }) => row.id).sort(), item.id).toEqual(
        item.ids.slice().sort(),
      );
      expect(response.body.meta.nextCursor, item.id).toBeNull();
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    const expected = [newer, ...[middleA, middleB].sort().reverse(), older],
      seen: string[] = [];
    let cursor: string | null = null;
    for (let index = 0; index < 4; index++) {
      const query: QueryTransport = { limit: '1', ...(cursor ? { cursor } : {}) },
        response = await request(app)
          .get(path + '?' + queryString(query))
          .set('Authorization', bearer(fixture.admin));
      expect(response.status).toBe(200);
      const records = response.body.data.map((row: unknown) => IncidentRecord.parse(row));
      expect(records).toHaveLength(1);
      expect(records[0]?.id).toBe(expected[index]);
      seen.push(records[0].id);
      cursor = response.body.meta.nextCursor as string | null;
      expect(cursor).toBe(index < 3 ? records[0].id : null);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    expect(new Set(seen).size).toBe(4);
    expect(seen).toEqual(expected);
    expect(await snapshot()).toEqual(before);
  },
);
