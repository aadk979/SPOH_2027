import type { SessionResponse } from '@spoh/shared';
import { AccountInactiveError, NotProvisionedError } from '../../../platform/errors/index.js';
import { issueAccessToken } from '../../../platform/identity/index.js';
import { prisma } from '../../../platform/db/client.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';
import { toSessionResponse } from '../data/mappers.js';
import { findVolunteerBySub } from '../data/repo.js';
import { homeMembership } from './homeMembership.js';
import { archiveReader } from '../../../platform/access/archiveStanding.js';

export interface SessionContext {
  userAgent: string | null;
  ip: string | null;
  providerAccessToken?: string;
}

/** Everything the client needs, plus the cookie value the router will set. */
export interface OpenedSession {
  response: SessionResponse;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * The person behind a subject, with their role in their home event. Being
 * able to authenticate and being allowed in are different questions
 * (BUILD_PLAN §6.2): a membership of a running event answers the second.
 */
export async function loadVolunteer(sub: string) {
  const volunteer = await findVolunteerBySub(sub);
  if (!volunteer) throw new NotProvisionedError();
  if (volunteer.deactivatedAt) throw new AccountInactiveError();

  const membership = await homeMembership(volunteer.id);
  if (!membership) throw new NotProvisionedError();
  if (!['ACTIVE', 'INVITED'].includes(membership.status) &&
    !await archiveReader(prisma, { personId: volunteer.id, status: membership.status, eventId: membership.eventId })) throw new AccountInactiveError();

  return { ...volunteer, role: membership.role, scope: { eventId: membership.eventId } };
}

/** Mint the access token for a stored session and describe it to the client. */
export async function issueSession(
  volunteer: Awaited<ReturnType<typeof loadVolunteer>>,
  session: {
    sub: string;
    sessionId: string;
    refreshToken: string;
    expiresAt: Date;
    mfaPending?: boolean;
  },
): Promise<OpenedSession> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: volunteer.scope.eventId },
    select: { organisationId: true },
  });
  const lifetime = await loadResolvedSetting('auth.accessTokenTtlSeconds', {
    organisationId: event.organisationId,
  });
  const access = await issueAccessToken(
    { sub: session.sub, sid: session.sessionId },
    lifetime.value as number,
  );
  return {
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    response: {
      ...toSessionResponse(volunteer, access),
      ...(session.mfaPending ? { mfaRequired: true } : {}),
    },
  };
}
