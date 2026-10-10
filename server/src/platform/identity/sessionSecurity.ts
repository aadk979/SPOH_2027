import { prisma } from '../db/client.js';
import { loadResolvedSetting } from '../settings/scopedStore.js';

/** Security limits follow every active admin membership, rather than the selected event. */
export async function liveSession(id: string, sub: string): Promise<boolean> {
  const now = new Date();
  const session = await prisma.refreshSession.findUnique({
    where: { id },
    include: {
      volunteer: {
        select: {
          cognitoSub: true,
          deactivatedAt: true,
          organisationMemberships: {
            where: { role: 'PLATFORM_ADMIN' },
            select: { organisationId: true },
          },
          eventMemberships: {
            where: {
              status: { in: ['ACTIVE', 'INVITED'] },
              event: { status: { not: 'ARCHIVED' } },
              role: { in: ['ADMIN', 'LEAD', 'CHIEF_COORDINATOR', 'DEPUTY_COORDINATOR'] },
            },
            select: { event: { select: { organisationId: true } } },
            take: 1,
          },
        },
      },
    },
  });
  if (!session || !basicStanding(session, { now, sub })) return false;
  const org = adminOrganisation(session.volunteer);
  if (org) {
    const idle = Number(
      (await loadResolvedSetting('security.adminIdleMinutes', { organisationId: org })).value,
    );
    if (now.getTime() - (session.lastUsedAt ?? session.issuedAt).getTime() >= idle * 60_000)
      return false;
  }
  if (!session.lastUsedAt || now.getTime() - session.lastUsedAt.getTime() >= 30_000)
    await prisma.refreshSession.updateMany({
      where: { id, revokedAt: null },
      data: { lastUsedAt: now },
    });
  return true;
}

function adminOrganisation(person: {
  organisationMemberships: { organisationId: string }[];
  eventMemberships: { event: { organisationId: string } }[];
}) {
  return (
    person.organisationMemberships[0]?.organisationId ??
    person.eventMemberships[0]?.event.organisationId
  );
}

function basicStanding(
  session: {
    revokedAt: Date | null;
    expiresAt: Date;
    mfaPending: boolean;
    absoluteExpiresAt: Date | null;
    volunteer: { cognitoSub: string; deactivatedAt: Date | null };
  },
  input: { now: Date; sub: string },
) {
  if (session.revokedAt || session.mfaPending || session.volunteer.deactivatedAt) return false;
  if (session.volunteer.cognitoSub !== input.sub || session.expiresAt <= input.now) return false;
  return !session.absoluteExpiresAt || session.absoluteExpiresAt > input.now;
}
