import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { invalidatePersonCredentials } from '../src/modules/auth/index.js';
import type { PrismaTransactionClient } from '../src/platform/db/client.js';
import { systemClock, type Clock } from '../src/platform/time/index.js';
import { verifyBootstrapIdentity } from './bootstrapAdmin.js';
import { validateRestoredOperator, type RestoredOperator } from './restoredOperatorInputs.js';

/** Owner-approved offline trust root for a deleted pool. No account creation or role promotion. */
export async function bootstrapRestoredOperator(prisma: PrismaClient, supplied: RestoredOperator,
  clock: Clock = systemClock): Promise<string> {
  const input = validateRestoredOperator(supplied);
  await verifyBootstrapIdentity(input);
  const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return prisma.$transaction(async (tx) => {
    const orgLock = `initial-platform-admin:${input.organisationId}`;
    const opLock = `restored-operator:${input.operationId}`;
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${orgLock}, 0))`;
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${opLock}, 0))`;
    await tx.$queryRaw`SELECT e.id FROM "Event" e WHERE e."organisationId" = ${input.organisationId}
      OR EXISTS (SELECT 1 FROM "EventMembership" m WHERE m."eventId" = e.id AND m."personId" = ${input.personId})
      ORDER BY e.id FOR SHARE OF e`;
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${input.organisationId} FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${input.personId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "OrganisationMembership" WHERE "personId" = ${input.personId} ORDER BY id FOR SHARE`;
    const person = await requireRestoredAdmin(tx, input);
    const prior = await tx.auditLog.findFirst({ where: { requestId: input.operationId }, select: {
      action: true, entityId: true, after: true, source: true, actorId: true, actorSub: true,
      eventId: true, membershipId: true, outcome: true } });
    if (prior) {
      const proof = prior.after as { restoredOperatorBootstrap?: boolean; operationDigest?: string } | null;
      if (prior.action !== 'user.reprovision' || prior.entityId !== person.id ||
        prior.source !== 'SYSTEM' || prior.actorId !== null || prior.actorSub !== 'bootstrap' ||
        prior.eventId !== null || prior.membershipId !== null || prior.outcome !== 'SUCCESS' ||
        !proof?.restoredOperatorBootstrap || proof.operationDigest !== digest || person.cognitoSub !== input.subject)
        throw new Error('Restored operator operation does not match its committed proof.');
      return person.id;
    }
    if (person.cognitoSub !== input.expectedSubject || input.expectedSubject === input.subject)
      throw new Error('Restored operator prior subject changed or requires the ordinary workflow.');
    await requireFirstRestoredOperator(tx, input);
    const collision = await tx.person.findUnique({ where: { cognitoSub: input.subject }, select: { id: true } });
    if (collision) throw new Error('Restored operator subject collision requires owner review.');
    const now = clock.now();
    await tx.person.update({ where: { id: person.id }, data: { cognitoSub: input.subject } });
    await invalidatePersonCredentials(tx as PrismaTransactionClient, { personId: person.id,
      reason: 'restored-operator-bootstrap', at: now });
    await tx.auditLog.create({ data: { actorId: null, actorSub: 'bootstrap', source: 'SYSTEM', eventId: null,
      membershipId: null, action: 'user.reprovision', entityType: 'Person', entityId: person.id,
      requestId: input.operationId, after: { restoredOperatorBootstrap: true, organisationId: input.organisationId,
        targetPoolId: input.userPoolId,
        operationDigest: digest, approvalDigest: createHash('sha256').update(input.approvalReference).digest('hex') } } });
    return person.id;
  }, { timeout: 30_000 });
}

async function requireFirstRestoredOperator(tx: Prisma.TransactionClient, input: RestoredOperator) {
  const prior = await tx.auditLog.findFirst({ where: { action: 'user.reprovision', source: 'SYSTEM',
    actorId: null, actorSub: 'bootstrap', eventId: null, membershipId: null, outcome: 'SUCCESS', AND: [
      { after: { path: ['restoredOperatorBootstrap'], equals: true } },
      { after: { path: ['organisationId'], equals: input.organisationId } },
      { after: { path: ['targetPoolId'], equals: input.userPoolId } },
    ] }, select: { id: true } });
  if (prior) throw new Error('A restored operator already exists for this pool; use the ordinary recovery workflow.');
}

async function requireRestoredAdmin(tx: Prisma.TransactionClient, input: RestoredOperator) {
  const person = await tx.person.findUnique({ where: { id: input.personId }, include: {
    organisationMemberships: true, eventMemberships: { include: { event: { select: { organisationId: true } } } } } });
  if (!person || person.deactivatedAt || person.piiErasedAt || person.email.toLowerCase() !== input.email ||
    person.displayName !== input.displayName || !person.organisationMemberships.some(row =>
      row.organisationId === input.organisationId && row.role === 'PLATFORM_ADMIN'))
    throw new Error('Restored operator must already be the exact active platform administrator.');
  if (person.organisationMemberships.some(row => row.organisationId !== input.organisationId) ||
    person.eventMemberships.some(row => row.event.organisationId !== input.organisationId))
    throw new Error('Restored operator has foreign organisation standing requiring coordinated owner review.');
  return person;
}
