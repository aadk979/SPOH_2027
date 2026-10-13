import { createHash, randomUUID } from 'node:crypto';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapProductionAdmin, type BootstrapAdmin } from '../../prisma/bootstrapAdmin.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

let input: BootstrapAdmin;
beforeEach(async () => {
  await resetDatabase();
  const scope = await testEvent();
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: scope.eventId } });
  input = { organisationId: event.organisationId, email: 'initial-admin@example.test',
    displayName: 'Initial Administrator', subject: randomUUID(), userPoolId: 'ap-southeast-1_synthetic',
    region: 'ap-southeast-1', approvalReference: 'synthetic-reviewed-bootstrap' };
  vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockImplementation(async () => ({
    $metadata: {}, Username: 'initial-provider-username', Enabled: true, UserStatus: 'CONFIRMED',
    UserAttributes: Object.entries({ sub: input.subject, email: input.email, email_verified: 'true', name: input.displayName })
      .map(([Name, Value]) => ({ Name, Value })),
  }) as never);
});
afterEach(() => vi.restoreAllMocks());
const execute = () => bootstrapProductionAdmin(rawDb, input);
const existing = () => rawDb.person.create({ data: {
  email: input.email, displayName: input.displayName, cognitoSub: input.subject,
} });

describe('production bootstrap transaction boundaries', () => {
  it('creates and audits only the first admin, then replays that exact identity without writes', async () => {
    const personId = await execute();
    const person = await rawDb.person.findUniqueOrThrow({ where: { id: personId } });
    const audit = await rawDb.auditLog.findFirstOrThrow({ where: { entityId: personId } });
    expect(audit).toMatchObject({ actorSub: 'bootstrap', source: 'SYSTEM', action: 'user.provision',
      after: { initialBootstrap: true, organisationId: input.organisationId,
        approvalDigest: createHash('sha256').update(input.approvalReference).digest('hex') } });
    expect(JSON.stringify(audit)).not.toContain(input.approvalReference);
    expect(await execute()).toBe(personId);
    expect(await rawDb.person.findUniqueOrThrow({ where: { id: personId } })).toEqual(person);
    expect(await rawDb.auditLog.count({ where: { entityId: personId } })).toBe(1);
    expect(await rawDb.organisationMembership.count({ where: { role: 'PLATFORM_ADMIN' } })).toBe(1);
  });
  it.each(['no-membership', 'ordinary-member', 'deactivated', 'erased', 'different-profile', 'different-subject'])(
    'refuses %s without promoting or changing the identity', async (kind) => {
      const person = await existing();
      if (kind !== 'no-membership') await rawDb.organisationMembership.create({ data: {
        organisationId: input.organisationId, personId: person.id, role: kind === 'ordinary-member' ? 'MEMBER' : 'PLATFORM_ADMIN' } });
      if (kind === 'deactivated') await rawDb.person.update({ where: { id: person.id }, data: { deactivatedAt: FROZEN_NOW } });
      if (kind === 'erased') await rawDb.person.update({ where: { id: person.id }, data: { piiErasedAt: FROZEN_NOW } });
      if (kind === 'different-profile') await rawDb.person.update({ where: { id: person.id }, data: { displayName: 'Different name' } });
      if (kind === 'different-subject') await rawDb.person.update({ where: { id: person.id }, data: { cognitoSub: randomUUID() } });
      const before = await rawDb.person.findUniqueOrThrow({ where: { id: person.id } });
      await expect(execute()).rejects.toThrow('Existing identities require');
      expect(await rawDb.person.findUniqueOrThrow({ where: { id: person.id } })).toEqual(before);
      expect(await rawDb.auditLog.count()).toBe(0);
    });
  it('refuses two rows that separately match the email and subject', async () => {
    await rawDb.person.create({ data: { email: input.email, displayName: input.displayName, cognitoSub: randomUUID() } });
    await rawDb.person.create({ data: { email: 'other@example.test', displayName: input.displayName, cognitoSub: input.subject } });
    await expect(execute()).rejects.toThrow('collision');
    expect(await rawDb.organisationMembership.count()).toBe(0);
  });
  it('does not add a second administrator or choose a different organisation', async () => {
    await execute();
    input = { ...input, email: 'second@example.test', subject: randomUUID() };
    await expect(execute()).rejects.toThrow('cannot add another administrator');
    input = { ...input, organisationId: 'missing-organisation' };
    await expect(execute()).rejects.toThrow('does not exist');
    expect(await rawDb.person.count({ where: { email: 'second@example.test' } })).toBe(0);
  });
  it('serialises concurrent exact retries into one person, membership and audit', async () => {
    const [first, second] = await Promise.all([execute(), execute()]);
    expect(second).toBe(first);
    expect(await rawDb.auditLog.count({ where: { action: 'user.provision' } })).toBe(1);
  });
  it('replays behind a held Person without deadlocking its recovery-journal organisation FK', async () => {
    const personId = await execute();
    let replay: Promise<string> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${personId} FOR UPDATE`;
      replay = execute();
      await expect.poll(async () => {
        const [row] = await rawDb.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Person"%FOR UPDATE%'`;
        return Number(row!.waiting);
      }).toBeGreaterThan(0);
      await tx.identityAccountOperation.create({ data: { id: randomUUID(), organisationId: input.organisationId,
        plannedPersonId: randomUUID(), actorPersonId: personId, targetPoolId: input.userPoolId,
        emailDigest: 'a'.repeat(64), profileDigest: 'b'.repeat(64), generation: randomUUID(),
        createdAt: FROZEN_NOW, updatedAt: FROZEN_NOW,
        leaseExpiresAt: new Date(FROZEN_NOW.getTime() + 60_000) } });
    }, { timeout: 15_000 });
    expect(await replay).toBe(personId);
    expect(await rawDb.auditLog.count({ where: { action: 'user.provision' } })).toBe(1);
  });
  it('rolls back identity and standing when the attributed audit fails', async () => {
    await rawDb.$executeRawUnsafe(`CREATE FUNCTION fail_bootstrap_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."actorSub" = 'bootstrap' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await rawDb.$executeRawUnsafe('CREATE TRIGGER fail_bootstrap_audit_test BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_bootstrap_audit_test()');
    try {
      await expect(execute()).rejects.toBeDefined();
      expect(await rawDb.person.count({ where: { email: input.email } })).toBe(0);
      expect(await rawDb.organisationMembership.count()).toBe(0);
    } finally {
      await rawDb.$executeRawUnsafe('DROP TRIGGER fail_bootstrap_audit_test ON "AuditLog"');
      await rawDb.$executeRawUnsafe('DROP FUNCTION fail_bootstrap_audit_test()');
    }
    await execute();
    expect(await rawDb.organisationMembership.count()).toBe(1);
  });
});
