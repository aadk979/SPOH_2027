import { randomUUID } from 'node:crypto';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bootstrapProductionAdmin, type BootstrapAdmin } from '../../prisma/bootstrapAdmin.js';
import { createApp } from '../../src/app/createApp.js';
import { identityProvider, localAuthIssuer, invalidateVolunteerCache } from '../../src/platform/identity/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';

const app = createApp();
const origin = 'http://localhost:3000';
let input: BootstrapAdmin;
let personId: string;
beforeEach(async () => {
  await resetDatabase();
  const organisation = await rawDb.organisation.create({ data: { slug: 'first-login', name: 'First login',
    appName: 'Synthetic operations', defaultTimezone: 'Asia/Singapore' } });
  input = { organisationId: organisation.id, email: 'initial-first-login@example.test', displayName: 'Initial Administrator',
    subject: randomUUID(), userPoolId: 'ap-southeast-1_synthetic', region: 'ap-southeast-1', approvalReference: 'synthetic-first-login-proof' };
  vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockImplementation(async () => ({
    $metadata: {}, Username: 'synthetic-bootstrap', Enabled: true, UserStatus: 'CONFIRMED',
    UserAttributes: Object.entries({ sub: input.subject, email: input.email, email_verified: 'true', name: input.displayName })
      .map(([Name, Value]) => ({ Name, Value })),
  }) as never);
  personId = await bootstrapProductionAdmin(rawDb, input);
});
afterEach(() => vi.restoreAllMocks());
const auth = (response: request.Response) => `Bearer ${response.body.accessToken as string}`;
const cookie = (response: request.Response) => (response.headers['set-cookie'] as unknown as string[])
  .find(value => value.startsWith('spoh_refresh='))!.split(';')[0]!;
async function signIn(expected = 201) {
  // Actual verified test-provider exchange, then a real stored API SID; groups grant no authority.
  const token = await localAuthIssuer!.issue({ sub: input.subject, groups: [] });
  return request(app).post('/api/v1/auth/session').set('Origin', origin).send({ providerAccessToken: token }).expect(expected);
}
const renew = (opened: request.Response) => request(app).post('/api/v1/auth/refresh').set('Origin', origin)
  .set('Cookie', cookie(opened));

it('signs in and renews the initial administrator before any event exists, without creating a fake membership', async () => {
  const opened = await signIn();
  expect(opened.body.volunteer).toMatchObject({ id: personId, role: 'ADMIN' });
  expect(await rawDb.event.count()).toBe(0);
  expect(await rawDb.eventMembership.count()).toBe(0);
  expect(await rawDb.auditLog.findFirst({ where: { action: 'session.create' } })).toMatchObject({
    actorId: personId, actorSub: input.subject, eventId: null, membershipId: null });
  const renewed = await renew(opened).expect(200);
  const first = await rawDb.refreshSession.findUniqueOrThrow({ where: { id: decodeJwt(opened.body.accessToken).sid as string } });
  const second = await rawDb.refreshSession.findUniqueOrThrow({ where: { id: decodeJwt(renewed.body.accessToken).sid as string } });
  expect(second.absoluteExpiresAt).toEqual(first.absoluteExpiresAt);
  expect(second.authenticatedAt).toEqual(first.authenticatedAt);
  await request(app).get('/api/v1/events/administration').set('Authorization', auth(renewed)).expect(200);
  await request(app).get('/api/v1/events/missing-event/stations').set('Authorization', auth(renewed)).expect(404);
  await request(app).delete('/api/v1/auth/session').set('Origin', origin).set('Cookie', cookie(renewed)).expect(204);
  await renew(renewed).expect(401);
});

it('completes fresh MFA with a new SID, then creates and joins the first real event through the API', async () => {
  vi.spyOn(identityProvider, 'hasMfa').mockResolvedValueOnce(false).mockResolvedValue(true);
  vi.spyOn(identityProvider, 'beginMfa').mockResolvedValue('SYNTHETIC-SEED');
  vi.spyOn(identityProvider, 'verifyMfa').mockResolvedValue();
  const opened = await signIn();
  expect(opened.body.mfaRequired).toBe(true);
  await request(app).get('/api/v1/events/administration').set('Authorization', auth(opened)).expect(401);
  await request(app).post('/api/v1/auth/mfa/setup').set('Origin', origin).set('Authorization', auth(opened)).send({}).expect(200);
  const verified = await request(app).post('/api/v1/auth/mfa/verify').set('Origin', origin)
    .set('Authorization', auth(opened)).send({ code: '123456' }).expect(200);
  expect(decodeJwt(verified.body.accessToken).sid).not.toBe(decodeJwt(opened.body.accessToken).sid);
  await request(app).get('/api/v1/events/administration').set('Authorization', auth(opened)).expect(401);
  expect(await rawDb.event.count()).toBe(0);
  expect(await rawDb.eventMembership.count()).toBe(0);
  const created = await request(app).post('/api/v1/events').set('Authorization', auth(verified)).send({
    organisationId: input.organisationId, name: 'First real event', slug: 'first-real-event', venue: 'Synthetic campus',
    timezone: 'Asia/Singapore', startDate: '2027-02-01', endDate: '2027-02-02', joinAsAdmin: true, idempotencyKey: randomUUID(),
  }).expect(201);
  expect(await rawDb.eventMembership.findFirst()).toMatchObject({ eventId: created.body.event.id, personId, role: 'ADMIN', status: 'ACTIVE' });
  expect(await rawDb.event.count()).toBe(1);
  await renew(verified).expect(200);
});

it.each(['membership', 'deactivated', 'erased'] as const)('refuses new and renewed platform sessions when %s standing is withdrawn', async (kind) => {
  const opened = await signIn();
  if (kind === 'membership') await rawDb.organisationMembership.update({ where: {
    organisationId_personId: { organisationId: input.organisationId, personId } }, data: { role: 'MEMBER' } });
  else await rawDb.person.update({ where: { id: personId }, data: kind === 'deactivated'
    ? { deactivatedAt: new Date() } : { piiErasedAt: new Date() } });
  invalidateVolunteerCache();
  await signIn(403);
  await renew(opened).expect(403);
  expect(await rawDb.event.count()).toBe(0);
  expect(await rawDb.eventMembership.count()).toBe(0);
});
