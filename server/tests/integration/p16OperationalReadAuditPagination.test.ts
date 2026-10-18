import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { AuditLogResponse, AuditQuery } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { rawDb } from '../helpers/db.js';
import { membershipOf } from '../helpers/fixtures.js';
import { workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
import { FROZEN_NOW } from '../setup.js';
const app = createApp(),
  action = 'synthetic.pagination',
  entityId = 'synthetic-audit-page-local';
let fixture: WorkspaceFixture,
  token: string,
  foreignEventId: string,
  foreignId: string,
  globalId: string,
  owned: Array<{ id: string; createdAt: Date }>;
beforeEach(async () => {
  expect(new URL(process.env.DATABASE_URL ?? '').pathname).toBe('/spoh2027_test');
  expect(process.env.TEST_DATABASE_URL).toBe(process.env.DATABASE_URL);
  expect(process.env.SPOH_SKIP_DOTENV).toBe('1');
  fixture = await workspaceFixture();
  const organisationId = (
      await rawDb.event.findUniqueOrThrow({
        where: { id: fixture.eventId },
        select: { organisationId: true },
      })
    ).organisationId,
    foreign = await createEvent({
      organisationId,
      slug: 'synthetic-audit-foreign',
      name: 'Synthetic local foreign audit fixture',
      timezone: 'Asia/Singapore',
      status: 'LIVE',
      categories: [],
      stationTypes: [],
      shiftTemplates: [],
    });
  foreignEventId = foreign.id;
  await rawDb.eventMembership.create({
    data: { eventId: foreignEventId, personId: fixture.admin.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  const member = await membershipOf(fixture.admin.id),
    make = (eventId: string | null, ms: number) =>
      rawDb.auditLog.create({
        data: {
          eventId,
          actorId: fixture.admin.id,
          membershipId: eventId === fixture.eventId ? member.id : null,
          action,
          entityType: 'SyntheticLocalAuditPage',
          entityId,
          after: { localOnly: true },
          createdAt: new Date(FROZEN_NOW.getTime() + ms),
        },
      });
  owned = [];
  for (const ms of [-1, 0, 0, 1]) owned.push(await make(fixture.eventId, ms));
  foreignId = (await make(foreignEventId, 1000)).id;
  globalId = (await make(null, 2000)).id;
  const admitted = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken: fixture.admin.token });
  expect(admitted.status).toBe(201);
  expect(admitted.body.mfaRequired ?? false).toBe(false);
  token = admitted.body.accessToken;
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
const prefix = (form: string) =>
  form === 'scoped' ? '/api/v1/events/' + fixture.eventId : '/api/v1';
async function get(path: string, query: Record<string, string>) {
  expect(AuditQuery.safeParse(query).success).toBe(true);
  const response = await request(app)
    .get(path + '?' + new URLSearchParams(query))
    .set('Authorization', 'Bearer ' + token);
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('private, no-store');
  const parsed = AuditLogResponse.parse(response.body);
  expect(parsed.meta.count).toBe(parsed.data.length);
  return parsed;
}
it.each(['scoped', 'alias'])(
  '%s audit created-time filters and tied keyset pages preserve complete exact rows',
  async (form) => {
    const before = await business(),
      path = prefix(form) + '/audit',
      query = { action, entityId },
      baseline = await get(path, { ...query, limit: '200' }),
      expected = owned
        .slice()
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
        )
        .map((r) => r.id);
    expect(baseline.data.map((r) => r.id)).toEqual(expected);
    expect(baseline.meta.nextCursor).toBeNull();
    for (const pageSize of [1, 2, 3]) {
      const seen: typeof baseline.data = [];
      let cursor: string | null = null;
      for (let index = 0; index < 4; index++) {
        const page = await get(path, {
          ...query,
          limit: String(pageSize),
          ...(cursor ? { cursor } : {}),
        });
        seen.push(...page.data);
        expect(page.meta.nextCursor).toBe(seen.length < 4 ? page.data.at(-1)?.id : null);
        cursor = page.meta.nextCursor;
        if (!cursor) break;
      }
      expect(seen).toEqual(baseline.data);
      expect(new Set(seen.map((r) => r.id)).size).toBe(4);
    }
    for (const [filter, ids] of [
      [
        { from: FROZEN_NOW.toISOString() },
        owned.filter((r) => r.createdAt.getTime() >= FROZEN_NOW.getTime()).map((r) => r.id),
      ],
      [
        { to: FROZEN_NOW.toISOString() },
        owned.filter((r) => r.createdAt.getTime() < FROZEN_NOW.getTime()).map((r) => r.id),
      ],
      [
        { from: FROZEN_NOW.toISOString(), to: new Date(FROZEN_NOW.getTime() + 1).toISOString() },
        owned.filter((r) => r.createdAt.getTime() === FROZEN_NOW.getTime()).map((r) => r.id),
      ],
    ] as Array<[Record<string, string>, string[]]>) {
      const page = await get(path, { ...query, ...filter, limit: '200' });
      expect(page.data.map((r) => r.id).sort()).toEqual(ids.sort());
      expect(page.meta.nextCursor).toBeNull();
    }
    const terminal = await get(path, { ...query, limit: '1', cursor: expected.at(-1)! });
    expect(terminal.data).toEqual([]);
    expect(terminal.meta.nextCursor).toBeNull();
    expect(await business()).toEqual(before);
  },
);
it.each(['scoped', 'alias'])(
  '%s audit foreign-event and global cursors behave like a missing cursor and preserve rows',
  async (form) => {
    const before = await business(),
      path = prefix(form) + '/audit',
      query = { action, entityId, limit: '200' },
      positive = await get('/api/v1/events/' + foreignEventId + '/audit', query);
    expect(positive.data.map((r) => r.id)).toEqual([foreignId]);
    expect(
      await rawDb.auditLog.findUnique({ where: { id: globalId }, select: { eventId: true } }),
    ).toEqual({ eventId: null });
    const missing = await get(path, { ...query, cursor: 'synthetic-missing-audit-cursor' });
    expect(missing.data).toEqual([]);
    expect(missing.meta.nextCursor).toBeNull();
    for (const cursor of [foreignId, globalId]) {
      const response = await get(path, { ...query, cursor });
      expect.soft(response).toEqual(missing);
      expect(response.data.some((r) => r.id === foreignId || r.id === globalId)).toBe(false);
    }
    expect(await business()).toEqual(before);
  },
);
