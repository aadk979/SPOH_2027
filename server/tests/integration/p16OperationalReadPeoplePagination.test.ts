import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { ListVolunteersQuery, VolunteerAdminRecord } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb } from '../helpers/db.js';
import { createVolunteer, membershipOf, type TestVolunteer } from '../helpers/fixtures.js';
import { workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
import { FROZEN_NOW } from '../setup.js';
const app = createApp(),
  sorts = ['name', 'role', 'lastSeen', 'created'] as const,
  roles = ['VOLUNTEER', 'IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD', 'ADMIN'] as const;
let fixture: WorkspaceFixture, people: TestVolunteer[], token: string;
beforeEach(async () => {
  expect(new URL(process.env.DATABASE_URL ?? '').pathname).toBe('/spoh2027_test');
  expect(process.env.TEST_DATABASE_URL).toBe(process.env.DATABASE_URL);
  expect(process.env.SPOH_SKIP_DOTENV).toBe('1');
  fixture = await workspaceFixture();
  people = [fixture.volunteer, fixture.ic];
  for (const role of ['DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD'] as const)
    people.push(
      await createVolunteer({
        email: 'synthetic-pagination-' + role.toLowerCase() + '@local.test',
        role,
      }),
    );
  people.push(fixture.admin);
  const labels = ['Zulu', 'Alpha', 'Alpha', 'Nora', 'Beta', 'Alpha'],
    seen = [null, -2000, -2000, -1000, null, -2000];
  for (const [index, actor] of people.entries()) {
    await rawDb.person.update({
      where: { id: actor.id },
      data: {
        displayName: labels[index],
        createdAt: new Date(FROZEN_NOW.getTime() + Math.floor(index / 2) * 1000),
      },
    });
    await rawDb.eventMembership.update({
      where: { id: (await membershipOf(actor.id)).id },
      data: {
        lastSeenAt: seen[index] === null ? null : new Date(FROZEN_NOW.getTime() + seen[index]!),
      },
    });
  }
  const response = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken: fixture.admin.token });
  expect(response.status).toBe(201);
  expect(response.body.mfaRequired ?? false).toBe(false);
  token = response.body.accessToken;
  expect(typeof token).toBe('string');
});
async function business() {
  return {
    people: await rawDb.person.findMany({ orderBy: { id: 'asc' } }),
    memberships: await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } }),
    assignments: await rawDb.shiftAssignment.findMany({ orderBy: { id: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
  };
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
it.each(sorts.flatMap((sort) => ['scoped', 'alias'].map((form) => ({ sort, form }))))(
  '$form people $sort pages retain tied sort order, terminate and preserve exact rows',
  async ({ sort, form }) => {
    const before = await business(),
      path =
        (form === 'scoped' ? '/api/v1/events/' + fixture.eventId : '/api/v1') + '/admin/volunteers';
    const input = before.people.map((person) => ({
      person,
      member: before.memberships.find(
        (m) => m.eventId === fixture.eventId && m.personId === person.id,
      )!,
    }));
    expect(input).toHaveLength(6);
    expect(input.every((x) => x.member)).toBe(true);
    input.sort((a, b) => {
      if (sort === 'created')
        return (
          b.person.createdAt.getTime() - a.person.createdAt.getTime() ||
          compare(b.person.id, a.person.id)
        );
      if (sort === 'role') {
        const byRole =
          roles.indexOf(a.member.role as (typeof roles)[number]) -
          roles.indexOf(b.member.role as (typeof roles)[number]);
        if (byRole) return byRole;
      }
      if (sort === 'lastSeen') {
        const x = a.member.lastSeenAt?.getTime() ?? Number.NEGATIVE_INFINITY,
          y = b.member.lastSeenAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        if (x !== y) return x < y ? -1 : 1;
      }
      return (
        compare(a.person.displayName, b.person.displayName) || compare(a.person.id, b.person.id)
      );
    });
    const expectedIds = input.map((x) => x.person.id),
      get = async (query: Record<string, string>) => {
        expect(ListVolunteersQuery.safeParse(query).success).toBe(true);
        const response = await request(app)
          .get(path + '?' + new URLSearchParams(query))
          .set('Authorization', 'Bearer ' + token);
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('private, no-store');
        const data = response.body.data.map((v: unknown) => VolunteerAdminRecord.parse(v));
        expect(response.body.meta.count).toBe(data.length);
        return { data, nextCursor: response.body.meta.nextCursor as string | null };
      };
    const baseline = await get({ sort, limit: '200' });
    expect(baseline.data.map((p: { id: string }) => p.id)).toEqual(expectedIds);
    expect(baseline.nextCursor).toBeNull();
    for (const pageSize of [1, 2, 4]) {
      const records: typeof baseline.data = [],
        cursors = new Set<string>();
      let cursor: string | null = null;
      for (let page = 0; page < 6; page++) {
        const result = await get({ sort, limit: String(pageSize), ...(cursor ? { cursor } : {}) });
        records.push(...result.data);
        expect(result.data.length).toBeLessThanOrEqual(pageSize);
        const remaining = 6 - records.length;
        expect(result.nextCursor).toBe(remaining > 0 ? result.data.at(-1)?.id : null);
        if (result.nextCursor === null) break;
        expect(cursors.has(result.nextCursor)).toBe(false);
        cursors.add(result.nextCursor);
        cursor = result.nextCursor;
      }
      expect(records).toEqual(baseline.data);
      expect(new Set(records.map((p: { id: string }) => p.id)).size).toBe(6);
    }
    for (const cursor of [expectedIds.at(-1)!, 'synthetic-missing-person-cursor']) {
      const empty = await get({ sort, limit: '1', cursor });
      expect(empty.data).toEqual([]);
      expect(empty.nextCursor).toBeNull();
    }
    expect(await business()).toEqual(before);
  },
);
