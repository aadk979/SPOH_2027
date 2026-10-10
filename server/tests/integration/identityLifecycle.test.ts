import { createHash, randomBytes } from 'node:crypto';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { identityProvider, invalidateVolunteerCache } from '../../src/platform/identity/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { defaultRoleGrantRows } from '../../src/platform/access/authorizer/roleGrants.js';
import { issueAccessToken } from '../../src/platform/identity/sessionTokens.js';

const app = createApp();
const cookie = (response: request.Response) => {
  const raw = response.headers['set-cookie'];
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  return values.find((value) => value.startsWith('spoh_refresh='))?.split(';')[0] ?? '';
};
let admin: TestVolunteer;
let member: TestVolunteer;
beforeEach(async () => {
  await resetDatabase();
  admin = await createVolunteer({ email: 'admin@identity.test', role: 'ADMIN' });
  member = await createVolunteer({ email: 'member@identity.test', role: 'VOLUNTEER' });
});
afterEach(() => vi.restoreAllMocks());

async function secondEvent() {
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: (await testEvent()).eventId } });
  const other = await rawDb.event.create({ data: { organisationId: event.organisationId, slug: 'other-identity-event', name: 'Other Event', timezone: event.timezone, status: 'DRAFT' } });
  await rawDb.rolePermission.createMany({ data: defaultRoleGrantRows().map((grant) => ({ eventId: other.id, ...grant })) });
  return other;
}
async function session(email = member.email) {
  return request(app).post('/api/v1/auth/session').send({ email }).expect(201);
}

describe('membership identity lifecycle', () => {
  it('creates an invitation and accepts it with an audit on first sign-in', async () => {
    const invited = await request(app).post('/api/v1/roster/volunteers').set('Authorization', bearer(admin))
      .send({ email: 'new@identity.test', displayName: 'Invited Member', idempotencyKey: crypto.randomUUID() }).expect(201);
    const id = invited.body.volunteer.id as string;
    expect(await rawDb.eventMembership.findFirst({ where: { personId: id } })).toMatchObject({ status: 'INVITED', acceptedAt: null });
    await session('new@identity.test');
    expect(await rawDb.eventMembership.findFirst({ where: { personId: id } })).toMatchObject({ status: 'ACTIVE', acceptedAt: expect.any(Date) });
    expect(await rawDb.auditLog.count({ where: { action: 'user.acceptInvite', actorId: id } })).toBe(1);
  });
  it('reuses an existing person case-insensitively in another event', async () => {
    const other = await secondEvent();
    await rawDb.eventMembership.create({ data: { eventId: other.id, personId: admin.id, role: 'ADMIN' } });
    await request(app).post(`/api/v1/events/${other.id}/roster/volunteers`).set('Authorization', bearer(admin))
      .send({ email: member.email.toUpperCase(), displayName: 'Known Member' }).expect(201);
    expect(await rawDb.person.count({ where: { email: member.email } })).toBe(1);
    expect(await rawDb.eventMembership.findFirst({ where: { eventId: other.id, personId: member.id } })).toMatchObject({ status: 'INVITED' });
    const opened = await session();
    await request(app).get(`/api/v1/events/${other.id}/me`).set('Authorization', `Bearer ${opened.body.accessToken as string}`).expect(200);
    expect(await rawDb.eventMembership.findFirst({ where: { eventId: other.id, personId: member.id } })).toMatchObject({ status: 'ACTIVE', acceptedAt: expect.any(Date) });
  });
  it('suspends only this event while preserving another membership and session', async () => {
    const other = await secondEvent();
    await rawDb.eventMembership.create({ data: { eventId: other.id, personId: member.id } });
    const opened = await session();
    const response = await request(app).post(`/api/v1/admin/volunteers/${member.id}/deactivate`).set('Authorization', bearer(admin))
      .send({ reason: 'Event roster correction', disableIdentity: true }).expect(200);
    expect(response.body).toMatchObject({ sessionsRevoked: 0, identityChanged: false });
    await request(app).get(`/api/v1/events/${other.id}/me`).set('Authorization', `Bearer ${opened.body.accessToken as string}`).expect(200);
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${opened.body.accessToken as string}`).expect(403);
  });
  it('rejects every invalid import before creating an identity or membership', async () => {
    const ensure = vi.spyOn(identityProvider, 'ensureUser');
    await request(app).post('/api/v1/roster/import').set('Authorization', bearer(admin))
      .send({ commit: true, rows: [{ email: 'bad@identity.test', displayName: 'Bad Row', stationCode: 'MISSING', eventDate: '2027-01-07', shift: 'MORNING' }] }).expect(400);
    expect(ensure).not.toHaveBeenCalled();
    expect(await rawDb.person.count({ where: { email: 'bad@identity.test' } })).toBe(0);
  });
  it('reports bulk policy failures separately and signs out another person', async () => {
    await session();
    const bulk = await request(app).post('/api/v1/admin/volunteers/bulk').set('Authorization', bearer(admin))
      .send({ ids: [member.id, admin.id], action: 'role', role: 'IC' }).expect(200);
    expect(bulk.body.data).toEqual([expect.objectContaining({ id: member.id, ok: true }), expect.objectContaining({ id: admin.id, ok: false })]);
    await session();
    const response = await request(app).post(`/api/v1/admin/volunteers/${member.id}/sign-out`).set('Authorization', bearer(admin)).send({}).expect(200);
    expect(response.body.sessionsRevoked).toBe(1);
  });
  it('limits cross-event person details and global suspension to platform admins', async () => {
    await request(app).get(`/api/v1/people/${member.id}`).set('Authorization', bearer(admin)).expect(403);
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: (await testEvent()).eventId } });
    await rawDb.organisationMembership.create({ data: { organisationId: event.organisationId, personId: admin.id, role: 'PLATFORM_ADMIN' } });
    const detail = await request(app).get(`/api/v1/people/${member.id}`).set('Authorization', bearer(admin)).expect(200);
    expect(detail.body.memberships).toHaveLength(1);
    await session();
    await request(app).post(`/api/v1/people/${member.id}/deactivate`).set('Authorization', bearer(admin)).send({ reason: 'Lost account credential' }).expect(200);
    await request(app).post('/api/v1/auth/session').send({ email: member.email }).expect(403);
    await request(app).post(`/api/v1/people/${member.id}/reactivate`).set('Authorization', bearer(admin)).send({}).expect(200);
    await session();
  });
});

describe('first-party recovery and MFA', () => {
  it('lists and revokes owned devices without requiring an Event1 membership', async () => {
    const other = await secondEvent();
    await rawDb.eventMembership.create({ data: { eventId: other.id, personId: member.id } });
    await rawDb.eventMembership.deleteMany({ where: { eventId: (await testEvent()).eventId, personId: member.id } });
    const own = await session();
    const somebodyElse = await session(admin.email);
    const header = `Bearer ${own.body.accessToken as string}`;
    const devices = await request(app).get('/api/v1/auth/sessions').set('Authorization', header).expect(200);
    expect(devices.body.data).toEqual([expect.objectContaining({ current: true })]);
    await request(app).delete(`/api/v1/auth/sessions/${decodeJwt(somebodyElse.body.accessToken as string).sid as string}`).set('Authorization', header).expect(404);
    await request(app).delete(`/api/v1/auth/sessions/${decodeJwt(own.body.accessToken as string).sid as string}`).set('Authorization', header).expect(204);
    await request(app).get('/api/v1/auth/sessions').set('Authorization', header).expect(401);
  });
  it('uses an expired signed proof only to revoke its own rotated family when cookies are blocked', async () => {
    const opened = await session();
    const anotherDevice = await session();
    const sid = decodeJwt(opened.body.accessToken as string).sid as string;
    const expired = await issueAccessToken({ sub: member.sub, sid }, -1);
    const renewed = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie(opened)).expect(200);
    await request(app).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${expired.token}`).expect(401);
    await request(app).delete('/api/v1/auth/session').set('Authorization', `Bearer ${expired.token}`).expect(204);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie(renewed)).expect(401);
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${anotherDevice.body.accessToken as string}`).expect(200);
  });
  it('refuses tampered logout proofs and binds a valid proof to the session owner', async () => {
    const opened = await session();
    const sid = decodeJwt(opened.body.accessToken as string).sid as string;
    const wrongOwner = await issueAccessToken({ sub: admin.sub, sid }, -1);
    await request(app).delete('/api/v1/auth/session').set('Authorization', `Bearer ${wrongOwner.token}`).expect(204);
    const token = opened.body.accessToken as string;
    await request(app).delete('/api/v1/auth/session').set('Authorization', `Bearer ${token.slice(0, -5)}aaaaa`).expect(204);
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
  });
  it('redeems a PKCE handoff without cookies once, rejecting a wrong verifier', async () => {
    const opened = await session();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(32).toString('base64url');
    const recovery = await request(app).get('/api/v1/auth/recover').set('Cookie', cookie(opened)).query({ challenge, state, returnTo: 'http://localhost:3000/e/test-event' }).expect(302);
    const target = new URL(recovery.headers.location as string);
    expect(target.searchParams.get('auth_state')).toBe(state);
    const code = target.searchParams.get('auth_code');
    await request(app).post('/api/v1/auth/handoff').send({ code, verifier: randomBytes(32).toString('base64url') }).expect(401);
    const redeemed = await request(app).post('/api/v1/auth/handoff').send({ code, verifier }).expect(200);
    expect(redeemed.headers['set-cookie']).toBeUndefined();
    expect(redeemed.body).not.toHaveProperty('refreshToken');
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${redeemed.body.accessToken as string}`).expect(200);
    await request(app).post('/api/v1/auth/handoff').send({ code, verifier }).expect(401);
  });
  it('returns signed-out for missing cookies and rejects unsafe return addresses', async () => {
    const query = { challenge: randomBytes(32).toString('base64url'), state: randomBytes(32).toString('base64url'), returnTo: 'http://localhost:3000/' };
    const result = await request(app).get('/api/v1/auth/recover').query(query).expect(302);
    expect(new URL(result.headers.location as string).searchParams.get('auth_status')).toBe('signed-out');
    await request(app).get('/api/v1/auth/recover').query({ ...query, returnTo: 'https://hostile.example/' }).expect(400);
    await request(app).get('/api/v1/auth/recover').query({ ...query, returnTo: 'not-a-url' }).expect(400);
  });
  it('signs out by thin bearer when the browser blocks third-party cookies', async () => {
    const opened = await session();
    await request(app).delete('/api/v1/auth/session').set('Authorization', `Bearer ${opened.body.accessToken as string}`).expect(204);
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${opened.body.accessToken as string}`).expect(401);
  });
  it('restricts an admin without TOTP to enrolment, then clears the temporary provider credential', async () => {
    vi.spyOn(identityProvider, 'hasMfa').mockResolvedValue(false);
    vi.spyOn(identityProvider, 'beginMfa').mockResolvedValue('TESTTOTPSECRET');
    vi.spyOn(identityProvider, 'verifyMfa').mockResolvedValue();
    const opened = await request(app).post('/api/v1/auth/session').send({ providerAccessToken: admin.token }).expect(201);
    expect(opened.body.mfaRequired).toBe(true);
    const token = opened.body.accessToken as string;
    const id = decodeJwt(token).sid as string;
    expect((await rawDb.refreshSession.findUniqueOrThrow({ where: { id } })).providerTokenEncrypted).not.toContain(admin.token);
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(401);
    await request(app).post('/api/v1/auth/mfa/setup').set('Authorization', `Bearer ${token}`).send({}).expect(200);
    const verified = await request(app).post('/api/v1/auth/mfa/verify').set('Authorization', `Bearer ${token}`).send({ code: '123456' }).expect(200);
    expect(verified.body.mfaRequired).toBeUndefined();
    invalidateVolunteerCache();
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${verified.body.accessToken as string}`).expect(200);
    expect(await rawDb.refreshSession.findUnique({ where: { id } })).toMatchObject({ mfaPending: false, providerTokenEncrypted: null });
  });
  it('expires admin sessions at configured idle and absolute limits', async () => {
    const opened = await session(admin.email);
    const id = decodeJwt(opened.body.accessToken as string).sid as string;
    await rawDb.refreshSession.update({ where: { id }, data: { lastUsedAt: new Date(Date.now() - 31 * 60_000) } });
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${opened.body.accessToken as string}`).expect(401);
    const again = await session(admin.email);
    await rawDb.refreshSession.update({ where: { id: decodeJwt(again.body.accessToken as string).sid as string }, data: { absoluteExpiresAt: new Date(Date.now() - 1000) } });
    await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie(again)).expect(401);
  });
});
