import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  newFamilyId,
} from '../../../platform/identity/index.js';
import { getSettings } from '../../../platform/settings/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { createRefreshSession, touchVolunteer } from '../data/repo.js';
import { refreshExpiry } from '../domain/sessionRules.js';
import {
  issueSession,
  loadVolunteer,
  type OpenedSession,
  type SessionContext,
} from './issueSession.js';
import { inCurrentEvent } from './sessionAudit.js';

/**
 * Open a session for an already-authenticated subject.
 *
 * The caller has verified the provider credential; this does not re-verify it.
 * It does re-check the roster, because being able to authenticate and being
 * allowed in are different questions (BUILD_PLAN §6.2).
 */
export async function openSession(
  sub: string,
  context: SessionContext,
  audit: AuditContext,
): Promise<OpenedSession> {
  const volunteer = await loadVolunteer(sub);

  const refreshToken = generateRefreshToken();
  const now = systemClock.now();
  const expiresAt = refreshExpiry(now, getSettings().refreshSessionDays);

  const recorded = await inCurrentEvent(audit, volunteer.id);
  const session = await prisma.$transaction(async (tx) => {
    const row = await createRefreshSession(tx, {
      volunteerId: volunteer.id,
      tokenHash: hashRefreshToken(refreshToken),
      familyId: newFamilyId(),
      userAgent: context.userAgent,
      ip: context.ip,
      expiresAt,
    });

    await touchVolunteer(tx, volunteer.scope, { id: volunteer.id, at: now });

    await writeAudit(tx, {
      ...recorded,
      actorId: volunteer.id,
      actorSub: sub,
      action: 'session.create',
      entityType: 'RefreshSession',
      entityId: row.id,
      after: { userAgent: context.userAgent },
    });

    return row;
  });

  return issueSession(volunteer, { sub, sessionId: session.id, refreshToken, expiresAt });
}
