import type { PrismaTransactionClient } from '../../../platform/db/client.js';

export async function eligiblePeople(tx: PrismaTransactionClient, organisationId: string) {
  return tx.person.findMany({ where: {
    deactivatedAt: null, piiErasedAt: null,
    OR: [{ organisationMemberships: { some: { organisationId, role: 'PLATFORM_ADMIN' } } },
      { eventMemberships: { some: { status: { in: ['ACTIVE', 'INVITED'] },
        event: { organisationId, status: { not: 'ARCHIVED' } } } } }],
  }, select: { id: true }, orderBy: { id: 'asc' }, take: 1001 });
}

/** Archive and identity writers share Event -> sorted Person -> child-row order. */
export async function holdRecoveryEvents(tx: PrismaTransactionClient,
  input: { organisationId: string; personId?: string; personIds?: readonly string[] }) {
  const personIds = input.personIds ?? (input.personId ? [input.personId] : []);
  await tx.$queryRaw`SELECT e.id FROM "Event" e WHERE e."organisationId" = ${input.organisationId}
    OR EXISTS (SELECT 1 FROM "EventMembership" m WHERE m."eventId" = e.id AND m."personId" = ANY(${personIds}::text[]))
    ORDER BY e.id FOR SHARE OF e`;
}

export async function operatorPerson(tx: PrismaTransactionClient, subject: string) {
  return tx.person.findUnique({ where: { cognitoSub: subject }, select: { id: true } });
}

export async function recoveryPerson(tx: PrismaTransactionClient, personId: string) {
  return tx.person.findUnique({ where: { id: personId }, select: {
    id: true, email: true, displayName: true, phone: true, cognitoSub: true,
    deactivatedAt: true, piiErasedAt: true,
    organisationMemberships: { select: { organisationId: true, role: true } },
    eventMemberships: { select: { status: true, event: { select: { organisationId: true, status: true } } } },
  } });
}
export type RecoveryPerson = NonNullable<Awaited<ReturnType<typeof recoveryPerson>>>;

export async function currentOperatorSession(tx: PrismaTransactionClient, sessionId: string) {
  await tx.$queryRaw`SELECT id FROM "RefreshSession" WHERE id = ${sessionId} FOR SHARE`;
  return tx.refreshSession.findUnique({ where: { id: sessionId }, select: {
    volunteerId: true, revokedAt: true, mfaPending: true, expiresAt: true,
    absoluteExpiresAt: true, authenticatedAt: true,
  } });
}

export async function boundRecoveryAccount(tx: PrismaTransactionClient,
  input: { targetPoolId: string; personId: string }) {
  return tx.identityAccountOperation.findUnique({ where: { targetPoolId_personId: input },
    select: { id: true, state: true, providerSubject: true, profileDigest: true, organisationId: true } });
}

export async function rebindSubject(tx: PrismaTransactionClient,
  input: { personId: string; expectedSubject: string; subject: string }) {
  return tx.person.updateMany({ where: { id: input.personId, cognitoSub: input.expectedSubject,
    deactivatedAt: null, piiErasedAt: null }, data: { cognitoSub: input.subject } });
}
