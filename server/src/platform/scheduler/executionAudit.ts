import { writeAudit, type AuditContext } from '../audit/index.js';
import type { PrismaTransactionClient } from '../db/client.js';
import type { ClaimedAction } from './claimRepo.js';
import type { FailurePlan } from './failure.js';

/** Attribution stays with the creator; permissions are resolved separately by the handler. */
export async function scheduleAuditContext(
  tx: PrismaTransactionClient,
  action: ClaimedAction,
): Promise<AuditContext> {
  const person =
    action.createdByPersonId === null
      ? null
      : await tx.person.findUnique({
          where: { id: action.createdByPersonId },
          select: { cognitoSub: true },
        });
  const member =
    action.eventId !== null && action.createdByPersonId !== null
      ? await tx.eventMembership.findFirst({
          where: { eventId: action.eventId, personId: action.createdByPersonId },
          select: { id: true },
        })
      : null;
  return {
    actorId: action.createdByPersonId,
    actorSub: person?.cognitoSub ?? (action.createdByPersonId === null ? 'system' : null),
    eventId: action.eventId,
    membershipId: member?.id ?? null,
    ip: null,
    userAgent: null,
    requestId: null,
    source: 'SCHEDULE',
    scheduledActionId: action.id,
  };
}

export function auditScheduleOutcome(
  tx: PrismaTransactionClient,
  input: {
    action: ClaimedAction;
    audit: AuditContext;
    result: FailurePlan | { status: 'SUCCEEDED'; lastError: null };
  },
) {
  const { action, audit, result } = input;
  return writeAudit(tx, {
    ...audit,
    action: 'schedule.execute',
    entityType: 'ScheduledAction',
    entityId: action.id,
    severity:
      result.status === 'DEAD' ? 'CRITICAL' : result.status === 'SUCCEEDED' ? 'INFO' : 'WARNING',
    outcome:
      result.status === 'SUCCEEDED'
        ? 'SUCCESS'
        : result.lastError === 'AUTHORITY_CHANGED'
          ? 'DENIED'
          : 'FAILURE',
    after: {
      type: action.type,
      status: result.status,
      attempts: action.attempts,
      dueAt: action.scheduledFor.toISOString(),
      error: result.lastError,
    },
  });
}
