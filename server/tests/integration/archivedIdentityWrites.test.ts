import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { identityProvider, invalidateVolunteerCache } from '../../src/platform/identity/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, makePlatformAdmin, testEvent, type TestVolunteer } from '../helpers/fixtures.js';

const app = createApp();
let eventId: string;
let admin: TestVolunteer;
let member: TestVolunteer;
const path = (suffix: string) => `/api/v1/events/${eventId}${suffix}`;
const post = (suffix: string, body: object = {}) => request(app).post(path(suffix))
  .set('Authorization', bearer(admin)).send(body);
const invite = () => ({ email: 'archived-invite@example.test', displayName: 'Archived invitation' });
const importInput = () => ({ commit: true, rows: [invite()] });
const archive = () => rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
const waitForEventLock = (query: string) => expect.poll(async () => {
  const [row] = await rawDb.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting
    FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
      AND query LIKE ${query}`;
  return Number(row!.waiting);
}).toBeGreaterThan(0);

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'archived-admin@example.test', role: 'ADMIN' });
  member = await createVolunteer({ email: 'archived-member@example.test', role: 'VOLUNTEER' });
  await makePlatformAdmin(admin.id);
});
afterEach(() => vi.restoreAllMocks());

it('refuses new identity provisioning and committed import before quota or provider side effects', async () => {
  const ensure = vi.spyOn(identityProvider, 'ensureUser');
  await archive();
  for (const [suffix, body] of [['/roster/volunteers', invite()], ['/roster/import', importInput()]] as const) {
    const response = await post(suffix, body);
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error.code).toBe('SETTING_LOCKED');
  }
  expect(ensure).not.toHaveBeenCalled();
  expect(await rawDb.identityDeliveryQuota.count()).toBe(0);
  expect(await rawDb.person.count()).toBe(2);
  expect(await rawDb.auditLog.count({ where: { action: { in: ['user.provision', 'roster.import'] } } })).toBe(0);
});

it('refuses profile, role, event-standing, invitation and session changes while keeping archive reads', async () => {
  const opened = await request(app).post('/api/v1/auth/session').send({ email: member.email }).expect(201);
  const resend = vi.spyOn(identityProvider, 'resendInvite');
  await archive();
  const prefix = `/admin/volunteers/${member.id}`;
  const updated = await request(app).patch(path(prefix)).set('Authorization', bearer(admin))
    .send({ displayName: 'Forbidden archived edit', role: 'IC' });
  expect(updated.status).toBe(409);
  for (const [suffix, body] of [
    ['/deactivate', { reason: 'Archived suspension attempt' }], ['/reactivate', {}],
    ['/resend-invite', {}], ['/sign-out', {}],
  ] as const) expect((await post(`${prefix}${suffix}`, body)).status).toBe(409);
  expect((await request(app).get(path(prefix)).set('Authorization', bearer(admin))).status).toBe(200);
  expect(await rawDb.eventMembership.findUnique({ where: { eventId_personId: { eventId, personId: member.id } } }))
    .toMatchObject({ status: 'ACTIVE', role: 'VOLUNTEER' });
  expect(await rawDb.person.findUnique({ where: { id: member.id } })).toMatchObject({ displayName: member.email });
  expect(resend).not.toHaveBeenCalled();
  expect(await rawDb.refreshSession.count({ where: { volunteerId: member.id, revokedAt: null } })).toBe(1);
  await request(app).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${opened.body.accessToken as string}`).expect(200);
});

it.each(['role', 'resend', 'deactivate'] as const)('reports archived bulk %s rows as refused without effects', async (action) => {
  await archive();
  const response = await post('/admin/volunteers/bulk', { ids: [member.id], action,
    ...(action === 'role' ? { role: 'IC' } : {}),
    ...(action === 'deactivate' ? { reason: 'Archived bulk attempt' } : {}) });
  expect(response.status).toBe(200);
  expect(response.body.data).toEqual([expect.objectContaining({ id: member.id, ok: false })]);
  expect(await rawDb.eventMembership.findUnique({ where: { eventId_personId: { eventId, personId: member.id } } }))
    .toMatchObject({ status: 'ACTIVE', role: 'VOLUNTEER' });
});

it('keeps settled permission reviews readable but refuses new reviews and grants after archive', async () => {
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const body = { expectedVersion: event.permissionsVersion, reason: 'Reviewed current grants', idempotencyKey: crypto.randomUUID() };
  await post('/permissions/review', body).expect(200);
  await archive();
  const replay = await post('/permissions/review', body).expect(200);
  expect(replay.body.data.canEdit).toBe(false);
  await post('/permissions/review', { ...body, idempotencyKey: crypto.randomUUID() }).expect(409);
  await request(app).put(path('/permissions')).set('Authorization', bearer(admin))
    .send({ role: 'LEAD', action: 'Settings.Read', granted: true, idempotencyKey: crypto.randomUUID() }).expect(409);
  const current = await request(app).get(path('/permissions')).set('Authorization', bearer(admin)).expect(200);
  expect(current.body.data.canEdit).toBe(false);
  expect(await rawDb.auditLog.count({ where: { action: 'permissions.review' } })).toBe(1);
  expect(await rawDb.auditLog.count({ where: { action: 'permissions.change' } })).toBe(0);
});

it.each(['invite', 'import', 'resend'] as const)('rechecks archive after the real Event lock wait before %s delivery', async (operation) => {
  const ensure = vi.spyOn(identityProvider, 'ensureUser');
  const resend = vi.spyOn(identityProvider, 'resendInvite');
  let pending: Promise<request.Response> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    pending = Promise.resolve(operation === 'invite' ? post('/roster/volunteers', invite())
      : operation === 'import' ? post('/roster/import', importInput())
      : post(`/admin/volunteers/${member.id}/resend-invite`));
    await waitForEventLock('%FROM "Event"%FOR SHARE%');
    await tx.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
  });
  const response = await pending!;
  expect(response.status, JSON.stringify(response.body)).toBe(409);
  expect(ensure).not.toHaveBeenCalled();
  expect(resend).not.toHaveBeenCalled();
  expect(await rawDb.identityDeliveryQuota.count()).toBe(0);
});

it('holds archive behind the identity delivery and attributed membership transaction', async () => {
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const delivery = new Promise<void>((resolve) => { release = resolve; });
  vi.spyOn(identityProvider, 'ensureUser').mockImplementation(async () => {
    entered();
    await delivery;
    return { sub: 'synthetic-locked-delivery', created: true };
  });
  const response = Promise.resolve(post('/roster/volunteers', invite()));
  await started;
  let archived = false;
  const transition = archive().then(() => { archived = true; });
  try {
    await waitForEventLock('%UPDATE%Event%');
    expect(archived).toBe(false);
  } finally { release(); }
  expect((await response).status).toBe(201);
  await transition;
  expect(await rawDb.auditLog.count({ where: { action: 'user.provision' } })).toBe(1);
});

it('retains historical platform reads for ended memberships while refusing their mutations', async () => {
  await archive();
  await rawDb.eventMembership.updateMany({ where: { eventId }, data: { status: 'ENDED' } });
  invalidateVolunteerCache();
  await request(app).get(path('/admin/volunteers')).set('Authorization', bearer(admin)).expect(200);
  await post('/roster/volunteers', invite()).expect(403);
  await request(app).get(path('/admin/volunteers')).set('Authorization', bearer(member)).expect(403);
  expect(await rawDb.person.count()).toBe(2);
});
