import { prisma } from '../db/client.js';
import { loadResolvedSetting } from '../settings/scopedStore.js';
import { originalSessionBoundary } from '../db/sessionBoundaryRepo.js';

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
          piiErasedAt: true,
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
  if (!session.absoluteExpiresAt && !await legacyBoundaryIsLive(session, now, org)) return false;
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

async function legacyBoundaryIsLive(session: { familyId: string; volunteerId: string }, now: Date, organisationId: string | undefined) {
  const original = await originalSessionBoundary(prisma, { familyId: session.familyId, personId: session.volunteerId });
  if (!original || original.expiresAt <= now) return false;
  const limit = organisationId ? Number((await loadResolvedSetting('security.adminSessionHours', { organisationId })).value) * 3_600_000 : 30 * 86_400_000;
  return now.getTime() - original.issuedAt.getTime() < Math.min(limit, 30 * 86_400_000);
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
    volunteer: { cognitoSub: string; deactivatedAt: Date | null; piiErasedAt: Date | null };
  },
  input: { now: Date; sub: string },
) {
  if (session.revokedAt || session.mfaPending || session.volunteer.deactivatedAt || session.volunteer.piiErasedAt) return false;
  if (session.volunteer.cognitoSub !== input.sub || session.expiresAt <= input.now) return false;
  return !session.absoluteExpiresAt || session.absoluteExpiresAt > input.now;
}
