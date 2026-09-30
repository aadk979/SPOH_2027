import type { SessionResponse } from '@spoh/shared';
import { AccountInactiveError, NotProvisionedError } from '../../../platform/errors/index.js';
import { issueAccessToken } from '../../../platform/identity/index.js';
import { toSessionResponse } from '../data/mappers.js';
import { findVolunteerBySub } from '../data/repo.js';
import { homeMembership } from './homeMembership.js';

export interface SessionContext {
  userAgent: string | null;
  ip: string | null;
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

  const membership = await homeMembership(volunteer.id);
  if (!membership) throw new NotProvisionedError();
  if (membership.status !== 'ACTIVE') throw new AccountInactiveError();

  return { ...volunteer, role: membership.role, scope: { eventId: membership.eventId } };
}

/** Mint the access token for a stored session and describe it to the client. */
export async function issueSession(
  volunteer: Awaited<ReturnType<typeof loadVolunteer>>,
  session: { sub: string; sessionId: string; refreshToken: string; expiresAt: Date },
): Promise<OpenedSession> {
  const access = await issueAccessToken({ sub: session.sub, sid: session.sessionId });
  return {
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    response: toSessionResponse(volunteer, access),
  };
}
