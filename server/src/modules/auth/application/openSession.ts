import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  newFamilyId,
} from '../../../platform/identity/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { createRefreshSession, touchVolunteer } from '../data/repo.js';
import {
  issueSession,
  loadVolunteer,
  type OpenedSession,
  type SessionContext,
} from './issueSession.js';
import { inHomeEvent } from './sessionAudit.js';
import { sessionSecurity } from './sessionSecurity.js';
import { acceptMembership, lockCredentialPerson } from '../data/securityRepo.js';

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
  const initial = await loadVolunteer(sub);
  const refreshToken = generateRefreshToken();
  const recorded = await inHomeEvent(audit, initial.id);
  const opened = await prisma.$transaction(async (tx) => {
    await lockCredentialPerson(tx, initial.id);
    const volunteer = await loadVolunteer(sub, tx);
    const now = systemClock.now();
    const security = await sessionSecurity(tx, { person: volunteer, context, now });
    const expiresAt = security.absoluteExpiresAt;
    const row = await createRefreshSession(tx, {
      volunteerId: volunteer.id,
      tokenHash: hashRefreshToken(refreshToken),
      familyId: newFamilyId(),
      userAgent: context.userAgent,
      ip: context.ip,
      expiresAt,
      issuedAt: now,
      authenticatedAt: context.authenticatedAt ?? null,
      ...security,
    });

    await touchVolunteer(tx, volunteer.scope, { id: volunteer.id, at: now });
    await recordInvitationAcceptance(tx, { recorded, volunteer, sub, now });

    await writeAudit(tx, {
      ...recorded,
      actorId: volunteer.id,
      actorSub: sub,
      action: 'session.create',
      entityType: 'RefreshSession',
      entityId: row.id,
      after: { userAgent: context.userAgent },
    });

    return { volunteer, row, security, expiresAt };
  }, { timeout: 30_000 });

  return issueSession(opened.volunteer, {
    sub,
    sessionId: opened.row.id,
    refreshToken,
    expiresAt: opened.expiresAt,
    mfaPending: opened.security.mfaPending,
  });
}

async function recordInvitationAcceptance(
  tx: PrismaTransactionClient,
  input: {
    recorded: AuditContext;
    volunteer: Awaited<ReturnType<typeof loadVolunteer>>;
    sub: string;
    now: Date;
  },
) {
  if (!('eventId' in input.volunteer.scope)) return;
  if (
    !(await acceptMembership(tx, input.volunteer.scope, {
      personId: input.volunteer.id,
      at: input.now,
    }))
  )
    return;
  await writeAudit(tx, {
    ...input.recorded,
    actorId: input.volunteer.id,
    actorSub: input.sub,
    action: 'user.acceptInvite',
    entityType: 'EventMembership',
    entityId: input.recorded.membershipId,
    after: { status: 'ACTIVE' },
  });
}
