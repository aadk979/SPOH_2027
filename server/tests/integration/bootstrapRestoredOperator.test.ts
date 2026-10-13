import { randomUUID } from 'node:crypto';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapRestoredOperator } from '../../prisma/bootstrapRestoredOperator.js';
import type { RestoredOperator } from '../../prisma/restoredOperatorInputs.js';
import { createApp } from '../../src/app/createApp.js';
import { env } from '../../src/config/env.js';
import { planIdentityRecovery } from '../../src/modules/identityRecovery/index.js';
import { localAuthIssuer } from '../../src/platform/identity/index.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, makePlatformAdmin, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

let input: RestoredOperator;
const originalProvider = env.AUTH_PROVIDER;
beforeEach(async () => {
  await resetDatabase();
  const operator = await createVolunteer({ email: 'restored-operator@example.test', displayName: 'Reviewed Operator', role: 'ADMIN' });
  await makePlatformAdmin(operator.id);
  const expectedSubject = randomUUID();
  await rawDb.person.update({ where: { id: operator.id }, data: { cognitoSub: expectedSubject } });
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: (await testEvent()).eventId } });
  input = { personId: operator.id, organisationId: event.organisationId, expectedSubject,
    subject: randomUUID(), email: operator.email, displayName: 'Reviewed Operator', operationId: randomUUID(),
    userPoolId: 'ap-southeast-1_synthetic', region: 'ap-southeast-1',
    approvalReference: 'synthetic-owner-approved-operator', reason: 'Deleted synthetic pool rehearsal' };
  vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockImplementation(async () => ({
    $metadata: {}, Username: 'reviewed-provider-operator', Enabled: true, UserStatus: 'CONFIRMED',
    UserAttributes: Object.entries({ sub: input.subject, email: input.email, email_verified: 'true', name: input.displayName })
      .map(([Name, Value]) => ({ Name, Value })),
  }) as never);
});
afterEach(() => { env.AUTH_PROVIDER = originalProvider; vi.restoreAllMocks(); });
const execute = () => bootstrapRestoredOperator(rawDb, input);
async function session(revoked = false) {
  return rawDb.refreshSession.create({ data: { volunteerId: input.personId, familyId: randomUUID(), tokenHash: randomUUID(),
    issuedAt: FROZEN_NOW, expiresAt: new Date(FROZEN_NOW.getTime() + 60_000),
    absoluteExpiresAt: new Date(FROZEN_NOW.getTime() + 60_000), providerTokenEncrypted: 'synthetic-private-envelope',
    providerTokenExpiresAt: FROZEN_NOW, ...(revoked ? { revokedAt: FROZEN_NOW, revokedReason: 'previous-reason' } : {}) } });
}

describe('owner-reviewed restored operator bootstrap', () => {
  it('preserves identities and standing, invalidates all credentials and replays only its exact audited operation', async () => {
    const memberships = await rawDb.eventMembership.findMany();
    const organisationMemberships = await rawDb.organisationMembership.findMany();
    const live = await session(); const terminal = await session(true);
    await rawDb.authHandoff.create({ data: { id: randomUUID(), sessionId: live.id, challenge: 'synthetic', expiresAt: live.expiresAt } });
    expect(await execute()).toBe(input.personId);
    expect((await rawDb.person.findUniqueOrThrow({ where: { id: input.personId } })).cognitoSub).toBe(input.subject);
    expect(await rawDb.person.count()).toBe(1);
    expect(await rawDb.eventMembership.findMany()).toEqual(memberships);
    expect(await rawDb.organisationMembership.findMany()).toEqual(organisationMemberships);
    expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: live.id } })).toMatchObject({
      revokedAt: FROZEN_NOW, revokedReason: 'restored-operator-bootstrap', providerTokenEncrypted: null, providerTokenExpiresAt: null });
    expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: terminal.id } })).toMatchObject({
      revokedReason: 'previous-reason', providerTokenEncrypted: null });
    expect(await rawDb.authHandoff.count()).toBe(0);
    const audit = await rawDb.auditLog.findFirstOrThrow({ where: { requestId: input.operationId } });
    expect(audit).toMatchObject({ actorSub: 'bootstrap', source: 'SYSTEM', eventId: null,
      after: { restoredOperatorBootstrap: true } });
    expect(JSON.stringify(audit)).not.toMatch(/example\.test|synthetic-owner-approved|synthetic-private-envelope/);
    expect(JSON.stringify(audit)).not.toContain(input.expectedSubject);
    expect(JSON.stringify(audit)).not.toContain(input.subject);
    const fresh = await session();
    await execute();
    expect((await rawDb.refreshSession.findUniqueOrThrow({ where: { id: fresh.id } })).revokedAt).toBeNull();
    expect(await rawDb.auditLog.count({ where: { requestId: input.operationId } })).toBe(1);
    input = { ...input, reason: 'changed intent' };
    await expect(execute()).rejects.toThrow('committed proof');
  });
  it.each(['missing-person', 'ordinary', 'deactivated', 'erased', 'profile', 'old-subject', 'foreign-org', 'collision'])(
    'refuses %s without rebinding or creating standing', async (kind) => {
      if (kind === 'missing-person') input = { ...input, personId: randomUUID() };
      if (kind === 'ordinary') await rawDb.organisationMembership.updateMany({ where: { personId: input.personId }, data: { role: 'MEMBER' } });
      if (kind === 'deactivated') await rawDb.person.update({ where: { id: input.personId }, data: { deactivatedAt: FROZEN_NOW } });
      if (kind === 'erased') await rawDb.person.update({ where: { id: input.personId }, data: { piiErasedAt: FROZEN_NOW } });
      if (kind === 'profile') input = { ...input, displayName: 'Different approved provider profile' };
      if (kind === 'old-subject') input = { ...input, expectedSubject: randomUUID() };
      if (kind === 'foreign-org') {
        const other = await rawDb.organisation.create({ data: { slug: 'other-restore', name: 'Other', appName: 'Other', defaultTimezone: 'UTC' } });
        await rawDb.organisationMembership.create({ data: { organisationId: other.id, personId: input.personId } });
      }
      if (kind === 'collision') await rawDb.person.create({ data: { email: 'collision@example.test', displayName: 'Other', cognitoSub: input.subject } });
      const before = await rawDb.person.findMany({ orderBy: { id: 'asc' } });
      await expect(execute()).rejects.toThrow();
      expect(await rawDb.person.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
      expect(await rawDb.auditLog.count({ where: { action: 'user.reprovision' } })).toBe(0);
    });
  it('rechecks withdrawn standing after provider proof and serialises concurrent exact attempts', async () => {
    const send = vi.mocked(CognitoIdentityProviderClient.prototype.send);
    const proof = send.getMockImplementation()!;
    send.mockImplementationOnce(async (...args: Parameters<typeof send>) => {
      const account = await proof(...args);
      await rawDb.organisationMembership.updateMany({ where: { personId: input.personId }, data: { role: 'MEMBER' } });
      return account;
    });
    await expect(execute()).rejects.toThrow('active platform administrator');
    await rawDb.organisationMembership.updateMany({ where: { personId: input.personId }, data: { role: 'PLATFORM_ADMIN' } });
    const [first, second] = await Promise.all([execute(), execute()]);
    expect(second).toBe(first);
    expect(await rawDb.auditLog.count({ where: { requestId: input.operationId } })).toBe(1);
  });
  it('rolls back subject, credentials and handoffs when the attributed audit cannot commit', async () => {
    const live = await session();
    await rawDb.authHandoff.create({ data: { id: randomUUID(), sessionId: live.id, challenge: 'synthetic', expiresAt: live.expiresAt } });
    await rawDb.$executeRawUnsafe(`CREATE FUNCTION refuse_operator_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."actorSub" = 'bootstrap' THEN RAISE EXCEPTION 'synthetic audit refusal'; END IF; RETURN NEW; END $$`);
    await rawDb.$executeRawUnsafe('CREATE TRIGGER refuse_operator_audit_test BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION refuse_operator_audit_test()');
    try {
      await expect(execute()).rejects.toThrow();
      expect((await rawDb.person.findUniqueOrThrow({ where: { id: input.personId } })).cognitoSub).toBe(input.expectedSubject);
      expect((await rawDb.refreshSession.findUniqueOrThrow({ where: { id: live.id } })).revokedAt).toBeNull();
      expect((await rawDb.refreshSession.findUniqueOrThrow({ where: { id: live.id } })).providerTokenEncrypted).toBe('synthetic-private-envelope');
      expect(await rawDb.authHandoff.count()).toBe(1);
    } finally {
      await rawDb.$executeRawUnsafe('DROP TRIGGER refuse_operator_audit_test ON "AuditLog"');
      await rawDb.$executeRawUnsafe('DROP FUNCTION refuse_operator_audit_test()');
    }
    await execute();
  });
  it('refuses a second offline operator for the same organisation and pool', async () => {
    await execute();
    const next = await createVolunteer({ email: 'second-retained-admin@example.test', displayName: 'Second Administrator', role: 'ADMIN' });
    await makePlatformAdmin(next.id);
    const old = randomUUID();
    await rawDb.person.update({ where: { id: next.id }, data: { cognitoSub: old } });
    input = { ...input, personId: next.id, email: next.email, displayName: 'Second Administrator',
      expectedSubject: old, subject: randomUUID(), operationId: randomUUID() };
    await expect(execute()).rejects.toThrow('ordinary recovery workflow');
    expect((await rawDb.person.findUniqueOrThrow({ where: { id: next.id } })).cognitoSub).toBe(old);
  });
  it('permits fresh verified sign-in to obtain the real SID required by recovery of other retained people', async () => {
    const target = await createVolunteer({ email: 'retained-target@example.test', role: 'VOLUNTEER' });
    await execute();
    const providerToken = await localAuthIssuer!.issue({ sub: input.subject, groups: [] });
    const signedIn = await request(createApp()).post('/api/v1/auth/session').set('Origin', 'http://localhost:3000')
      .send({ providerAccessToken: providerToken }).expect(201);
    env.AUTH_PROVIDER = 'cognito';
    const reviewed = await planIdentityRecovery({ organisationId: input.organisationId, targetPoolId: input.userPoolId,
      operatorToken: signedIn.body.accessToken }, fixedClock(FROZEN_NOW));
    expect(reviewed.items.map(item => item.personId)).toEqual([target.id]);
  });
});
