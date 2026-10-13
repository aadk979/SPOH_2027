import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { prisma } from '../../src/platform/db/client.js';
import { authProvider, identityProvider, invalidateVolunteerCache } from '../../src/platform/identity/index.js';
import { invalidatePersonCredentials } from '../../src/modules/auth/index.js';
import { openSession } from '../../src/modules/auth/application/openSession.js';
import { createSessionHandoff } from '../../src/modules/auth/application/createSessionHandoff.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
const trusted = 'http://localhost:3000';
let target: TestVolunteer;
let admin: TestVolunteer;
let eventId: string;
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'credential-admin@example.test', role: 'ADMIN' });
  target = await createVolunteer({ email: 'credential-target@example.test', role: 'VOLUNTEER' });
});
afterEach(() => vi.restoreAllMocks());
const sid = (response: request.Response) => decodeJwt(response.body.accessToken as string).sid as string;
const cookie = (response: request.Response): string => {
  const values: unknown = response.headers['set-cookie'];
  const headers = Array.isArray(values) ? values as string[] : typeof values === 'string' ? [values] : [];
  return headers.find((header) => header.startsWith('spoh_refresh='))!.split(';')[0]!;
};
const signIn = (person = target) => request(app).post('/api/v1/auth/session').set('Origin', trusted).send({ email: person.email });
const refresh = (response: request.Response) => request(app).post('/api/v1/auth/refresh').set('Origin', trusted).set('Cookie', cookie(response));
const actor = () => bearer(admin);
async function personWaiting() {
  await expect.poll(async () => {
    const [row] = await rawDb.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Person"%FOR UPDATE%'`;
    return Number(row!.waiting);
  }).toBeGreaterThan(0);
}
async function promote() {
  return request(app).patch(`/api/v1/events/${eventId}/admin/volunteers/${target.id}`)
    .set('Authorization', actor()).send({ role: 'DEPUTY_COORDINATOR', idempotencyKey: randomUUID() });
}

it('atomically invalidates live and terminal credentials while preserving forensic revocation history', async () => {
  const opened = await signIn().expect(201);
  const existing = await rawDb.refreshSession.findUniqueOrThrow({ where: { id: sid(opened) } });
  const old = await rawDb.refreshSession.create({ data: { volunteerId: target.id, familyId: 'old-family',
    tokenHash: 'a'.repeat(64), issuedAt: FROZEN_NOW, expiresAt: existing.expiresAt,
    revokedAt: new Date(FROZEN_NOW.getTime() - 1000), revokedReason: 'original-reason',
    providerTokenEncrypted: 'terminal-secret', providerTokenExpiresAt: existing.expiresAt } });
  for (const sessionId of [existing.id, old.id]) await rawDb.authHandoff.create({ data: {
    id: randomBytes(32).toString('base64url'), sessionId, challenge: 'challenge', expiresAt: existing.expiresAt,
  } });
  const input = { personId: target.id, reason: 'role-changed', at: FROZEN_NOW };
  await expect(prisma.$transaction(async (tx) => {
    expect(await invalidatePersonCredentials(tx, input)).toBe(1);
    throw new Error('rollback');
  })).rejects.toThrow('rollback');
  expect(await rawDb.authHandoff.count()).toBe(2);
  expect((await rawDb.refreshSession.findUniqueOrThrow({ where: { id: existing.id } })).revokedAt).toBeNull();
  expect(await prisma.$transaction((tx) => invalidatePersonCredentials(tx, input))).toBe(1);
  expect(await prisma.$transaction((tx) => invalidatePersonCredentials(tx, input))).toBe(0);
  expect(await rawDb.authHandoff.count()).toBe(0);
  expect(await rawDb.refreshSession.findUnique({ where: { id: old.id } })).toMatchObject({
    revokedAt: old.revokedAt, revokedReason: 'original-reason', providerTokenEncrypted: null, providerTokenExpiresAt: null,
  });
});

it.each(['patch', 'provision', 'import'] as const)('promotion through %s ends every old credential and requires current MFA', async (operation) => {
  const opened = await signIn().expect(201);
  await createSessionHandoff({ sessionId: sid(opened), sub: target.sub, challenge: randomBytes(32).toString('base64url') });
  const row = { email: target.email, displayName: target.email, role: 'DEPUTY_COORDINATOR' };
  const response = operation === 'patch' ? await promote()
    : await request(app).post(`/api/v1/events/${eventId}/roster/${operation === 'import' ? 'import' : 'volunteers'}`)
      .set('Authorization', actor()).send(operation === 'import' ? { rows: [row], commit: true } : row);
  expect(response.status).toBe(operation === 'provision' ? 201 : 200);
  expect(await rawDb.authHandoff.count()).toBe(0);
  await refresh(opened).expect(401);
  invalidateVolunteerCache();
  await request(app).get('/api/v1/me').set('Authorization', `Bearer ${opened.body.accessToken as string}`).expect(401);
  vi.spyOn(identityProvider, 'hasMfa').mockResolvedValue(false);
  const restricted = await request(app).post('/api/v1/auth/session').set('Origin', trusted)
    .send({ providerAccessToken: target.token }).expect(201);
  expect(restricted.body.mfaRequired).toBe(true);
});

it('serializes concurrent issuers without lock upgrades and rechecks promotion after a held Person lock', async () => {
  const context = { userAgent: null, ip: null };
  const audit = { actorId: target.id, actorSub: target.sub, eventId, membershipId: null, requestId: 'credential-fence', ip: null, userAgent: null };
  const sessions = await Promise.all(Array.from({ length: 4 }, () => openSession(target.sub, context, audit)));
  expect(new Set(sessions.map((session) => decodeJwt(session.response.accessToken).sid)).size).toBe(4);
  vi.spyOn(identityProvider, 'hasMfa').mockResolvedValue(false);
  let pending: Promise<unknown> | undefined;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${target.id} FOR UPDATE`;
    pending = openSession(target.sub, context, audit).catch((error: unknown) => error);
    await personWaiting();
    await tx.eventMembership.update({ where: { eventId_personId: { eventId, personId: target.id } }, data: { role: 'DEPUTY_COORDINATOR' } });
    await invalidatePersonCredentials(tx, { personId: target.id, reason: 'role-changed', at: FROZEN_NOW });
  });
  expect(await pending).toMatchObject({ code: 'SESSION_EXPIRED' });
  expect(await rawDb.refreshSession.count({ where: { volunteerId: target.id, revokedAt: null } })).toBe(0);
});

it('refuses refresh and handoff redemption that waited behind credential invalidation', async () => {
  const opened = await signIn().expect(201);
  const verifier = randomBytes(32).toString('base64url');
  const code = await createSessionHandoff({ sessionId: sid(opened), sub: target.sub,
    challenge: createHash('sha256').update(verifier).digest('base64url') });
  let rotate: Promise<request.Response> | undefined;
  let redeem: Promise<request.Response> | undefined;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${target.id} FOR UPDATE`;
    rotate = Promise.resolve(refresh(opened));
    redeem = Promise.resolve(request(app).post('/api/v1/auth/handoff').set('Origin', trusted).send({ code, verifier }));
    await personWaiting();
    await invalidatePersonCredentials(tx, { personId: target.id, reason: 'recovery', at: FROZEN_NOW });
  });
  expect((await rotate!).status).toBe(401);
  expect((await redeem!).status).toBe(401);
  expect(await rawDb.refreshSession.count({ where: { volunteerId: target.id, revokedAt: null } })).toBe(0);
});

it('completes MFA with a new full SID and cookie while the old restricted SID stays terminal', async () => {
  vi.spyOn(identityProvider, 'hasMfa').mockResolvedValueOnce(false).mockResolvedValue(true);
  vi.spyOn(identityProvider, 'verifyMfa').mockResolvedValue();
  const opened = await request(app).post('/api/v1/auth/session').set('Origin', trusted)
    .send({ providerAccessToken: admin.token }).expect(201);
  const completed = await request(app).post('/api/v1/auth/mfa/verify').set('Origin', trusted)
    .set('Authorization', `Bearer ${opened.body.accessToken as string}`).send({ code: '123456' }).expect(200);
  expect(sid(completed)).not.toBe(sid(opened));
  expect(cookie(completed)).not.toBe(cookie(opened));
  expect(await rawDb.refreshSession.findUnique({ where: { id: sid(opened) } })).toMatchObject({
    mfaPending: true, revokedReason: 'mfa-completed', providerTokenEncrypted: null,
  });
  invalidateVolunteerCache();
  await request(app).get('/api/v1/me').set('Authorization', `Bearer ${opened.body.accessToken as string}`).expect(401);
  await request(app).get('/api/v1/me').set('Authorization', `Bearer ${completed.body.accessToken as string}`).expect(200);
  await refresh(completed).expect(200);
});

it('does not issue a full credential after standing is withdrawn during provider MFA verification', async () => {
  vi.spyOn(identityProvider, 'hasMfa').mockResolvedValue(false);
  vi.spyOn(identityProvider, 'verifyMfa').mockImplementation(async () => {
    await rawDb.person.update({ where: { id: admin.id }, data: { deactivatedAt: FROZEN_NOW } });
  });
  const opened = await request(app).post('/api/v1/auth/session').set('Origin', trusted)
    .send({ providerAccessToken: admin.token }).expect(201);
  await request(app).post('/api/v1/auth/mfa/verify').set('Origin', trusted)
    .set('Authorization', `Bearer ${opened.body.accessToken as string}`).send({ code: '123456' }).expect(401);
  expect(await rawDb.refreshSession.count({ where: { volunteerId: admin.id, mfaPending: false } })).toBe(0);
});

it.each(['missing', 'future', 'old'] as const)('requires original fresh provider authentication for remote-device revocation: %s', async (invalid) => {
  const mine = await signIn().expect(201);
  const other = await signIn().expect(201);
  const authenticatedAt = invalid === 'missing' ? null : new Date(FROZEN_NOW.getTime() + (invalid === 'future' ? 1000 : -300_001));
  await rawDb.refreshSession.update({ where: { id: sid(mine) }, data: { authenticatedAt } });
  await request(app).delete(`/api/v1/auth/sessions/${sid(other)}`).set('Origin', trusted)
    .set('Authorization', `Bearer ${mine.body.accessToken as string}`).expect(401);
  expect((await rawDb.refreshSession.findUniqueOrThrow({ where: { id: sid(other) } })).revokedAt).toBeNull();
  await request(app).delete(`/api/v1/auth/sessions/${sid(mine)}`).set('Origin', trusted)
    .set('Authorization', `Bearer ${mine.body.accessToken as string}`).expect(204);
});

it.each(['missing', 'future', 'old', 'deactivated', 'erased'] as const)(
  'refuses MFA enrollment before provider effects when original authentication/standing is %s', async (invalid) => {
    vi.spyOn(identityProvider, 'hasMfa').mockResolvedValue(false);
    const begin = vi.spyOn(identityProvider, 'beginMfa');
    const verify = vi.spyOn(identityProvider, 'verifyMfa');
    const opened = await request(app).post('/api/v1/auth/session').set('Origin', trusted)
      .send({ providerAccessToken: admin.token }).expect(201);
    expect(opened.body.mfaRequired).toBe(true);
    if (invalid === 'deactivated' || invalid === 'erased') await rawDb.person.update({ where: { id: admin.id },
      data: invalid === 'deactivated' ? { deactivatedAt: FROZEN_NOW } : { piiErasedAt: FROZEN_NOW } });
    else await rawDb.refreshSession.update({ where: { id: sid(opened) }, data: {
      authenticatedAt: invalid === 'missing' ? null : new Date(FROZEN_NOW.getTime() + (invalid === 'future' ? 1000 : -300_001)),
    } });
    for (const route of ['setup', 'verify']) await request(app).post(`/api/v1/auth/mfa/${route}`)
      .set('Origin', trusted).set('Authorization', `Bearer ${opened.body.accessToken as string}`)
      .send(route === 'verify' ? { code: '123456' } : {}).expect(401);
    expect(begin).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(await rawDb.refreshSession.count({ where: { volunteerId: admin.id, mfaPending: false } })).toBe(0);
  },
);

it('rotation preserves verified auth_time and the original absolute family expiry', async () => {
  const authTime = Math.floor(FROZEN_NOW.getTime() / 1000) - 600;
  vi.spyOn(authProvider, 'verify').mockResolvedValue({ sub: target.sub, groups: [], authTime });
  const opened = await request(app).post('/api/v1/auth/session').set('Origin', trusted).send({ providerAccessToken: 'verified-synthetic' }).expect(201);
  const first = await rawDb.refreshSession.findUniqueOrThrow({ where: { id: sid(opened) } });
  const rotated = await refresh(opened).expect(200);
  const second = await rawDb.refreshSession.findUniqueOrThrow({ where: { id: sid(rotated) } });
  expect(second.authenticatedAt).toEqual(new Date(authTime * 1000));
  expect(second.authenticatedAt).toEqual(first.authenticatedAt);
  expect(second.absoluteExpiresAt).toEqual(first.absoluteExpiresAt);
  expect(second.expiresAt).toEqual(first.expiresAt);
});

it.each([29, 31])('legacy NULL limits use the audited original issuance %s days ago rather than the newer rotation row', async (ageDays) => {
  const day = 86_400_000;
  const opened = await signIn().expect(201);
  const rotated = await refresh(opened).expect(200);
  const originalExpiry = new Date(FROZEN_NOW.getTime() + day);
  await rawDb.refreshSession.update({ where: { id: sid(opened) }, data: {
    issuedAt: new Date(FROZEN_NOW.getTime() - ageDays * day), expiresAt: originalExpiry, absoluteExpiresAt: null,
  } });
  await rawDb.refreshSession.update({ where: { id: sid(rotated) }, data: {
    absoluteExpiresAt: null, expiresAt: new Date(FROZEN_NOW.getTime() + 10 * day),
  } });
  const result = await refresh(rotated).expect(ageDays === 29 ? 200 : 401);
  if (ageDays === 29) expect(await rawDb.refreshSession.findUnique({ where: { id: sid(result) } }))
    .toMatchObject({ absoluteExpiresAt: originalExpiry, expiresAt: originalExpiry });
});

it('requires fresh sign-in when a legacy family has lost its original retained issuance row', async () => {
  const opened = await signIn().expect(201);
  const rotated = await refresh(opened).expect(200);
  await rawDb.refreshSession.delete({ where: { id: sid(opened) } });
  await rawDb.refreshSession.update({ where: { id: sid(rotated) }, data: { absoluteExpiresAt: null } });
  await refresh(rotated).expect(401);
  invalidateVolunteerCache();
  await request(app).get('/api/v1/me').set('Authorization', `Bearer ${rotated.body.accessToken as string}`).expect(401);
  await signIn().expect(201);
});

it('does not make a malformed verified auth_time fresh by substituting the current time', async () => {
  vi.spyOn(authProvider, 'verify').mockResolvedValue({ sub: target.sub, groups: [], authTime: Number.NaN });
  const opened = await request(app).post('/api/v1/auth/session').set('Origin', trusted)
    .send({ providerAccessToken: 'verified-synthetic' }).expect(201);
  expect((await rawDb.refreshSession.findUniqueOrThrow({ where: { id: sid(opened) } })).authenticatedAt).toBeNull();
});

it('rechecks erased standing after remote revocation waits behind the Person fence', async () => {
  const mine = await signIn().expect(201);
  const other = await signIn().expect(201);
  let pending: Promise<request.Response> | undefined;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${target.id} FOR UPDATE`;
    pending = Promise.resolve(request(app).delete(`/api/v1/auth/sessions/${sid(other)}`).set('Origin', trusted)
      .set('Authorization', `Bearer ${mine.body.accessToken as string}`));
    await personWaiting();
    await tx.person.update({ where: { id: target.id }, data: { piiErasedAt: FROZEN_NOW } });
  });
  expect((await pending!).status).toBe(401);
  expect((await rawDb.refreshSession.findUniqueOrThrow({ where: { id: sid(other) } })).revokedAt).toBeNull();
  invalidateVolunteerCache();
  await request(app).get('/api/v1/me').set('Authorization', `Bearer ${mine.body.accessToken as string}`).expect(401);
  await signIn().expect(403);
});
