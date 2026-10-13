import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { planIdentityRecovery, applyIdentityRecovery, inviteRecoveredIdentities } from '../../src/modules/identityRecovery/index.js';
import { issueAccessToken } from '../../src/platform/identity/sessionTokens.js';
import type { IdentityProvider } from '../../src/platform/identity/provisioning.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { categoryId, createStation, createVolunteer, makePlatformAdmin, membershipOf, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const POOL = 'ap-southeast-1_recovery';
const clock = fixedClock(FROZEN_NOW);
const authProvider = env.AUTH_PROVIDER;
let operator: TestVolunteer;
let target: TestVolunteer;
let organisationId: string;
let operatorToken: string;
let operatorSessionId: string;
let provider: IdentityProvider;
const future = (minutes: number) => new Date(FROZEN_NOW.getTime() + minutes * 60_000);

async function fullSession(person: TestVolunteer, extras = {}) {
  return rawDb.refreshSession.create({ data: { volunteerId: person.id, familyId: randomUUID(),
    tokenHash: randomUUID(), issuedAt: FROZEN_NOW, authenticatedAt: FROZEN_NOW,
    expiresAt: future(60), absoluteExpiresAt: future(60), ...extras } });
}
const plan = () => planIdentityRecovery({ organisationId, targetPoolId: POOL, operatorToken }, clock);
const execute = (reviewed: unknown) => applyIdentityRecovery({ plan: reviewed, operatorToken, provider,
  reason: 'Synthetic restore rehearsal', ownerApprovalReference: 'synthetic-test-approval' }, clock);
const invite = (reviewed: unknown, resendKey?: string) => inviteRecoveredIdentities({ plan: reviewed,
  operatorToken, provider, reason: 'Synthetic invitation rehearsal', ownerApprovalReference: 'synthetic-test-approval',
  ...(resendKey ? { resendKey } : {}) }, clock);

beforeEach(async () => {
  await resetDatabase();
  operator = await createVolunteer({ email: 'recovery-operator@example.test', role: 'ADMIN' });
  target = await createVolunteer({ email: 'recovery-target@example.test', role: 'VOLUNTEER' });
  await makePlatformAdmin(operator.id);
  organisationId = (await rawDb.event.findUniqueOrThrow({ where: { id: (await testEvent()).eventId } })).organisationId;
  const session = await fullSession(operator);
  operatorSessionId = session.id;
  operatorToken = (await issueAccessToken({ sub: operator.sub, sid: session.id }, 300)).token;
  env.AUTH_PROVIDER = 'cognito';
  provider = { name: 'cognito', poolId: POOL,
    ensureUser: vi.fn(async (input) => ({ sub: `restored:${input.email}`, username: input.email, created: true })),
    disableUser: vi.fn(), enableUser: vi.fn(), resendInvite: vi.fn().mockResolvedValue(true),
    hasMfa: vi.fn().mockResolvedValue(true), beginMfa: vi.fn(), verifyMfa: vi.fn() };
});
afterEach(() => { env.AUTH_PROVIDER = authProvider; vi.restoreAllMocks(); });

describe('reviewed identity recovery', () => {
  it('plans without account, invitation, quota or subject writes and excludes the acting operator', async () => {
    const reviewed = await plan();
    expect(reviewed.items.map((row) => row.personId)).toEqual([target.id]);
    expect(JSON.stringify(reviewed)).not.toMatch(/example\.test|restored:|displayName|cognitoSub|operatorToken/);
    expect(await rawDb.identityAccountOperation.count()).toBe(0);
    expect(await rawDb.identityInvitationAttempt.count()).toBe(0);
    expect(await rawDb.identityDeliveryQuota.count()).toBe(0);
    expect(provider.ensureUser).not.toHaveBeenCalled();
  });

  it('works in an organisation with zero events using actual platform standing', async () => {
    const empty = await rawDb.organisation.create({ data: { slug: 'empty-recovery', name: 'Empty',
      appName: 'Empty', defaultTimezone: 'Asia/Singapore' } });
    await rawDb.organisationMembership.createMany({ data: [operator, target].map((person) => ({
      organisationId: empty.id, personId: person.id, role: 'PLATFORM_ADMIN' })) });
    organisationId = empty.id;
    expect((await plan()).items.map((row) => row.personId)).toEqual([target.id]);
    await rawDb.organisationMembership.delete({ where: { organisationId_personId: { organisationId, personId: operator.id } } });
    // Missing organisation standing conceals the organisation, just like an unknown target.
    await expect(plan()).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(['old', 'future', 'pool-mismatch', 'self', 'foreign-organisation', 'changed-subject'])(
    'refuses a %s reviewed plan before provider work', async (kind) => {
      const reviewed = await plan();
      if (kind === 'old') reviewed.plannedAt = future(-8 * 24 * 60).toISOString();
      if (kind === 'future') reviewed.plannedAt = future(1).toISOString();
      if (kind === 'pool-mismatch') provider = { ...provider, poolId: 'ap-southeast-1_different' };
      if (kind === 'self') reviewed.items[0]!.personId = operator.id;
      if (kind === 'foreign-organisation') {
        const foreign = await rawDb.organisation.create({ data: { slug: 'foreign-recovery', name: 'Foreign',
          appName: 'Foreign', defaultTimezone: 'Asia/Singapore' } });
        await rawDb.organisationMembership.create({ data: { organisationId: foreign.id, personId: target.id } });
      }
      if (kind === 'changed-subject') await rawDb.person.update({ where: { id: target.id }, data: { cognitoSub: 'changed-old-subject' } });
      await expect(execute(reviewed)).rejects.toBeDefined();
      expect(provider.ensureUser).not.toHaveBeenCalled();
      expect(await rawDb.identityAccountOperation.count()).toBe(0);
    });

  it.each(['forged', 'unprovisioned', 'wrong-subject'])(
    'requires %s operator JWT proof to resolve a current provisioned person and SID', async (kind) => {
      if (kind === 'forged') operatorToken = `${operatorToken.slice(0, -12)}invalidproof`;
      if (kind === 'unprovisioned') operatorToken = (await issueAccessToken({ sub: 'unprovisioned', sid: operatorSessionId }, 300)).token;
      if (kind === 'wrong-subject') operatorToken = (await issueAccessToken({ sub: target.sub, sid: operatorSessionId }, 300)).token;
      await expect(plan()).rejects.toMatchObject({ statusCode: 401 });
      expect(provider.ensureUser).not.toHaveBeenCalled();
    });

  it('refuses a provider subject already bound to another Person and leaves resumable progress', async () => {
    const reviewed = await plan();
    vi.mocked(provider.ensureUser).mockResolvedValueOnce({ sub: operator.sub, username: target.email, created: true });
    await expect(execute(reviewed)).rejects.toBeDefined();
    expect((await rawDb.person.findUniqueOrThrow({ where: { id: target.id } })).cognitoSub).toBe(target.sub);
    expect(await rawDb.identityAccountOperation.findFirst()).toMatchObject({ state: 'PROVIDER_READY' });
    expect(provider.resendInvite).not.toHaveBeenCalled();
  });

  it.each(['revoked', 'restricted', 'expired', 'missing-auth-time', 'stale-auth-time', 'future-auth-time', 'missing-absolute'])(
    'refuses %s operator credentials before journals or provider work', async (kind) => {
      const data = kind === 'revoked' ? { revokedAt: FROZEN_NOW } : kind === 'restricted' ? { mfaPending: true }
        : kind === 'expired' ? { expiresAt: FROZEN_NOW } : kind === 'missing-auth-time' ? { authenticatedAt: null }
          : kind === 'stale-auth-time' ? { authenticatedAt: future(-6) } : kind === 'future-auth-time'
            ? { authenticatedAt: future(1) } : { absoluteExpiresAt: null };
      await rawDb.refreshSession.update({ where: { id: operatorSessionId }, data });
      await expect(plan()).rejects.toMatchObject({ statusCode: 401 });
      expect(await rawDb.identityAccountOperation.count()).toBe(0);
      expect(provider.ensureUser).not.toHaveBeenCalled();
    });

  it('atomically rebinds, revokes all credentials and retains captured records and membership identities', async () => {
    const scope = await testEvent();
    const membership = await membershipOf(target.id);
    const station = await createStation({ code: 'RECOVERY-RECORD' });
    const record = await rawDb.registration.create({ data: { eventId: scope.eventId, categoryId: await categoryId('SEC_1'),
      stationId: station.id, recordedById: target.id, recordedByMembershipId: membership.id, idempotencyKey: randomUUID() } });
    const live = await fullSession(target, { providerTokenEncrypted: 'private-envelope', providerTokenExpiresAt: future(5) });
    const terminal = await fullSession(target, { revokedAt: future(-1), revokedReason: 'signed-out',
      providerTokenEncrypted: 'old-private-envelope', providerTokenExpiresAt: future(5) });
    await rawDb.authHandoff.createMany({ data: [live, terminal].map((session) => ({ id: randomUUID(),
      sessionId: session.id, challenge: 'private-challenge', expiresAt: future(2) })) });
    const reviewed = await plan();
    const result = await execute(reviewed);
    expect(result).toMatchObject({ bound: 1, items: [{ personId: target.id, status: 'BOUND', replayed: false }] });
    expect(provider.resendInvite).not.toHaveBeenCalled();
    expect(await rawDb.person.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ cognitoSub: `restored:${target.email}` });
    expect(await rawDb.registration.findUniqueOrThrow({ where: { id: record.id } })).toEqual(record);
    expect(await membershipOf(target.id)).toEqual(membership);
    expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: terminal.id } })).toMatchObject({
      revokedAt: future(-1), revokedReason: 'signed-out', providerTokenEncrypted: null, providerTokenExpiresAt: null });
    expect(await rawDb.authHandoff.count({ where: { sessionId: { in: [live.id, terminal.id] } } })).toBe(0);
    expect((await execute(reviewed)).items[0]?.replayed).toBe(true);
    expect(provider.ensureUser).toHaveBeenCalledTimes(1);
    expect(await rawDb.auditLog.count({ where: { action: 'user.reprovision', entityId: target.id } })).toBe(1);
  });

  it.each(['profile', 'operator-role', 'target-inactive', 'event-archived'])(
    'rechecks %s after suppressed provider creation and retains recoverable provider progress', async (change) => {
      const reviewed = await plan();
      vi.mocked(provider.ensureUser).mockImplementationOnce(async (input) => {
        if (change === 'profile') await rawDb.person.update({ where: { id: target.id }, data: { phone: '+6500000000' } });
        if (change === 'operator-role') await rawDb.organisationMembership.update({ where: {
          organisationId_personId: { organisationId, personId: operator.id } }, data: { role: 'MEMBER' } });
        if (change === 'target-inactive') await rawDb.person.update({ where: { id: target.id }, data: { deactivatedAt: FROZEN_NOW } });
        if (change === 'event-archived') await rawDb.event.update({ where: { id: (await testEvent()).eventId }, data: { status: 'ARCHIVED' } });
        return { sub: 'new-provider-subject', username: input.email, created: true };
      });
      await expect(execute(reviewed)).rejects.toBeDefined();
      expect((await rawDb.person.findUniqueOrThrow({ where: { id: target.id } })).cognitoSub).toBe(target.sub);
      expect(await rawDb.identityAccountOperation.findFirst()).toMatchObject({ state: 'PROVIDER_READY' });
      expect(await rawDb.auditLog.count({ where: { action: 'user.reprovision' } })).toBe(0);
      expect(provider.resendInvite).not.toHaveBeenCalled();
    });

  it('resumes provider-ready progress after a bind audit rollback without another external create', async () => {
    const reviewed = await plan();
    const session = await fullSession(target);
    await rawDb.$executeRawUnsafe(`CREATE FUNCTION fail_recovery_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action = 'user.reprovision' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await rawDb.$executeRawUnsafe('CREATE TRIGGER fail_recovery_audit_test BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_recovery_audit_test()');
    try {
      await expect(execute(reviewed)).rejects.toBeDefined();
      expect((await rawDb.person.findUniqueOrThrow({ where: { id: target.id } })).cognitoSub).toBe(target.sub);
      expect((await rawDb.refreshSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).toBeNull();
      expect(await rawDb.identityAccountOperation.findFirst()).toMatchObject({ state: 'PROVIDER_READY', boundAt: null });
    } finally {
      await rawDb.$executeRawUnsafe('DROP TRIGGER fail_recovery_audit_test ON "AuditLog"');
      await rawDb.$executeRawUnsafe('DROP FUNCTION fail_recovery_audit_test()');
    }
    await execute(reviewed);
    expect(provider.ensureUser).toHaveBeenCalledTimes(1);
    expect(await rawDb.identityAccountOperation.findFirst()).toMatchObject({ state: 'BOUND' });
  });

  it('rejects a competing worker while suppressed creation is in flight', async () => {
    const reviewed = await plan();
    let observed!: () => void;
    let resume!: () => void;
    const started = new Promise<void>((resolve) => { observed = resolve; });
    const held = new Promise<void>((resolve) => { resume = resolve; });
    vi.mocked(provider.ensureUser).mockImplementationOnce(async (input) => {
      observed(); await held; return { sub: 'one-created-subject', username: input.email, created: true };
    });
    const first = execute(reviewed);
    await started;
    try { await expect(execute(reviewed)).rejects.toMatchObject({ statusCode: 409 }); }
    finally { resume(); }
    await first;
    expect(provider.ensureUser).toHaveBeenCalledTimes(1);
  });

  it('samples authentication freshness after waiting for held Person locks', async () => {
    const reviewed = await plan();
    let entered!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const holder = rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${operator.id} FOR UPDATE`;
      entered(); await held;
    }, { timeout: 15_000 });
    await locked;
    let sampledNow = FROZEN_NOW;
    const running = applyIdentityRecovery({ plan: reviewed, operatorToken, provider,
      reason: 'Synthetic queued request', ownerApprovalReference: 'synthetic-test-approval' }, { now: () => sampledNow });
    const refused = expect(running).rejects.toMatchObject({ statusCode: 401 });
    try {
      await expect.poll(async () => {
        const [row] = await rawDb.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Person"%FOR UPDATE%'`;
        return Number(row!.waiting);
      }).toBeGreaterThan(0);
      sampledNow = future(6);
    } finally { release(); }
    await holder;
    await refused;
    expect(provider.ensureUser).not.toHaveBeenCalled();
    expect(await rawDb.identityAccountOperation.count()).toBe(0);
  });

  it('keeps an ambiguous invitation reservation and never automatically sends it again', async () => {
    const reviewed = await plan();
    await execute(reviewed);
    vi.mocked(provider.resendInvite).mockRejectedValue(new Error('private-provider-sentinel'));
    await expect(invite(reviewed)).rejects.toMatchObject({ statusCode: 503 });
    await expect(invite(reviewed)).rejects.toMatchObject({ statusCode: 503 });
    expect(provider.resendInvite).toHaveBeenCalledTimes(1);
    expect(await rawDb.identityInvitationAttempt.findFirst()).toMatchObject({ state: 'DELIVERY_UNKNOWN' });
    expect(await rawDb.identityDeliveryQuota.findFirst()).toMatchObject({ used: 1 });
    await expect(invite(reviewed, randomUUID())).rejects.toMatchObject({ statusCode: 503 });
    expect(provider.resendInvite).toHaveBeenCalledTimes(2);
    expect(await rawDb.identityDeliveryQuota.findFirst()).toMatchObject({ used: 2 });
  });

  it('records provider acceptance once; a retry consumes no extra allowance or send', async () => {
    const reviewed = await plan();
    await execute(reviewed);
    expect(await invite(reviewed)).toMatchObject({ accepted: 1 });
    expect(await invite(reviewed)).toMatchObject({ accepted: 1 });
    expect(provider.resendInvite).toHaveBeenCalledTimes(1);
    expect(await rawDb.identityDeliveryQuota.findFirst()).toMatchObject({ used: 1 });
  });
});
