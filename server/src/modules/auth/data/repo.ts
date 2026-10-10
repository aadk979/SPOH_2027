import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Data access for refresh sessions and the volunteer rows they belong to. */

export async function findVolunteerBySub(sub: string) {
  return prisma.person.findUnique({
    where: { cognitoSub: sub },
    select: { id: true, displayName: true, email: true, deactivatedAt: true },
  });
}

/** A person's membership of the event: where role and standing live (ADR-001 §1). */
export async function findMembership(scope: EventScope, personId: string) {
  return prisma.eventMembership.findUnique({
    where: { eventId_personId: { eventId: scope.eventId, personId } },
    select: { id: true, role: true, status: true },
  });
}

/**
 * A person's memberships of unarchived events, including CLOSED for reports
 * and late sync, oldest event first. A platform read about the person, so it goes
 * through the person rather than naming one event (ADR-001 §4).
 */
export async function findLiveMemberships(personId: string) {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      eventMemberships: {
        where: { event: { status: { not: 'ARCHIVED' } } },
        select: { id: true, eventId: true, role: true, status: true },
        orderBy: [{ event: { createdAt: 'asc' } }, { event: { id: 'asc' } }],
      },
    },
  });
  return person?.eventMemberships ?? [];
}

export async function findArchivedAdminMembership(personId: string) {
  const person = await prisma.person.findUnique({ where: { id: personId },
    select: { organisationMemberships: { where: { role: 'PLATFORM_ADMIN' }, select: { organisationId: true } } } });
  if (!person?.organisationMemberships.length) return null;
  const row = await prisma.person.findUnique({ where: { id: personId },
    select: { eventMemberships: { where: { status: 'ENDED', event: { status: 'ARCHIVED',
      organisationId: { in: person.organisationMemberships.map((member) => member.organisationId) } } },
      select: { id: true, eventId: true, role: true, status: true },
      orderBy: { event: { createdAt: 'desc' } }, take: 1 } } });
  return row?.eventMemberships[0] ?? null;
}

/**
 * The development sign-in's lookup: an email is enough, outside Cognito. The
 * role is the person's in their home event (the first running one), for the
 * token's groups; authorization reads the membership on every request anyway.
 */
export async function findVolunteerByEmail(email: string) {
  const person = await prisma.person.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: {
      cognitoSub: true,
      eventMemberships: {
        where: { status: { in: ['ACTIVE', 'INVITED'] }, event: { status: { not: 'ARCHIVED' } } },
        orderBy: [{ event: { createdAt: 'asc' } }, { event: { id: 'asc' } }],
        take: 1,
        select: { role: true },
      },
    },
  });
  if (!person) return null;
  return { cognitoSub: person.cognitoSub, role: person.eventMemberships[0]?.role ?? 'VOLUNTEER' };
}

export async function createRefreshSession(
  tx: PrismaTransactionClient,
  data: {
    volunteerId: string;
    tokenHash: string;
    familyId: string;
    userAgent: string | null;
    ip: string | null;
    expiresAt: Date;
    absoluteExpiresAt?: Date | null;
    mfaPending?: boolean;
    providerTokenEncrypted?: string | null;
    providerTokenExpiresAt?: Date | null;
  },
): Promise<{ id: string }> {
  return tx.refreshSession.create({ data, select: { id: true } });
}

export async function touchVolunteer(
  tx: PrismaTransactionClient,
  scope: EventScope,
  visit: { id: string; at: Date },
): Promise<void> {
  const { id, at } = visit;
  await tx.person.update({ where: { id }, data: { lastSeenAt: at } });
  await tx.eventMembership.updateMany({
    where: { eventId: scope.eventId, personId: id },
    data: { lastSeenAt: at },
  });
}

export async function findSessionByTokenHash(tokenHash: string) {
  return prisma.refreshSession.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      familyId: true,
      volunteerId: true,
      expiresAt: true,
      revokedAt: true,
      revokedReason: true,
      replacedById: true,
      absoluteExpiresAt: true,
      issuedAt: true,
      lastUsedAt: true,
      mfaPending: true,
      volunteer: { select: { cognitoSub: true } },
    },
  });
}

export type PresentedSession = NonNullable<Awaited<ReturnType<typeof findSessionByTokenHash>>>;

export async function revokeSession(
  tx: PrismaTransactionClient,
  id: string,
  revocation: { at: Date; reason: string; lastUsedAt?: Date },
): Promise<void> {
  await tx.refreshSession.update({
    where: { id },
    data: {
      revokedAt: revocation.at,
      revokedReason: revocation.reason,
      ...(revocation.lastUsedAt ? { lastUsedAt: revocation.lastUsedAt } : {}),
    },
  });
}

/** Revokes every live session matching `where`; returns how many were live. */
export async function revokeLiveSessions(
  where: { familyId: string } | { volunteerId: string } | { id: string; volunteerId: string },
  revocation: { at: Date; reason: string },
  tx: PrismaTransactionClient = prisma,
): Promise<number> {
  const { count } = await tx.refreshSession.updateMany({
    where: { ...where, revokedAt: null },
    data: { revokedAt: revocation.at, revokedReason: revocation.reason },
  });
  await tx.$executeRaw`SELECT pg_notify('session', ${JSON.stringify({ reason: revocation.reason })})`;
  return count;
}

export async function listLiveSessions(volunteerId: string, now: Date) {
  return prisma.refreshSession.findMany({
    where: { volunteerId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { issuedAt: 'desc' },
    select: {
      id: true,
      userAgent: true,
      issuedAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });
}

/** Expired rows, and rows revoked before the cutoff. Returns how many went. */
export async function deleteStaleSessions(
  tx: PrismaTransactionClient,
  cutoff: { now: Date; revokedBefore: Date },
): Promise<number> {
  const { now, revokedBefore } = cutoff;
  await tx.authHandoff.deleteMany({ where: { expiresAt: { lt: now } } });
  await tx.refreshSession.updateMany({
    where: { providerTokenExpiresAt: { lt: now } },
    data: {
      providerTokenEncrypted: null,
      providerTokenExpiresAt: null,
    },
  });
  const { count } = await tx.refreshSession.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: revokedBefore } }],
    },
  });
  return count;
}
