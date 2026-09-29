import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

/** Data access for refresh sessions and the volunteer rows they belong to. */

export async function findVolunteerBySub(sub: string) {
  return prisma.person.findUnique({
    where: { cognitoSub: sub },
    select: { id: true, displayName: true, role: true, active: true },
  });
}

/** The development sign-in's lookup: an email is enough, outside Cognito. */
export async function findVolunteerByEmail(email: string) {
  return prisma.person.findUnique({
    where: { email },
    select: { cognitoSub: true, role: true },
  });
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
  },
): Promise<{ id: string }> {
  return tx.refreshSession.create({ data, select: { id: true } });
}

export async function touchVolunteer(
  tx: PrismaTransactionClient,
  id: string,
  at: Date,
): Promise<void> {
  await tx.person.update({ where: { id }, data: { lastSeenAt: at } });
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
      volunteer: { select: { cognitoSub: true, active: true } },
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
): Promise<number> {
  const { count } = await prisma.refreshSession.updateMany({
    where: { ...where, revokedAt: null },
    data: { revokedAt: revocation.at, revokedReason: revocation.reason },
  });
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
export async function deleteStaleSessions(now: Date, revokedBefore: Date): Promise<number> {
  const { count } = await prisma.refreshSession.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: revokedBefore } }],
    },
  });
  return count;
}
