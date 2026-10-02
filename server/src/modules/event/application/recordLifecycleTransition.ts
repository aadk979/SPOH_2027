import type { GoLiveOverride } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { publishCacheEvent } from '../../../platform/events/cacheBus.js';
import type { LifecycleEvent, LifecycleStateRow } from '../data/lifecycleRepo.js';
import type { LifecycleSnapshot, TransitionEvaluation } from '../domain/lifecycle.js';

interface LifecycleAuditInput {
  scope: EventScope;
  audit: AuditContext;
  before: LifecycleEvent;
  after: LifecycleStateRow;
  snapshot: LifecycleSnapshot;
  decision: TransitionEvaluation;
  closedWindows: string[];
  closeOut?: { unclaimedItems: number; finalSnapshotId: string; archiveReminderId: string };
  reopen?: { supersededFinalSnapshotIds: string[]; cancelledArchiveReminderIds: string[] };
  archive?: { endedMemberships: number; cancelledArchiveReminderIds: string[] };
  reason?: string;
  goLiveOverrides?: readonly GoLiveOverride[];
}

function guardResults(input: LifecycleAuditInput) {
  const { snapshot, decision } = input;
  return {
    structure: snapshot.structure,
    hasBeenLive: snapshot.hasBeenLive,
    archive: snapshot.archive,
    ...(decision.action === 'Event.GoLive'
      ? {
          goLiveChecks: snapshot.goLiveChecks,
          goLiveOverrides: [...(input.goLiveOverrides ?? [])],
          overrideAuthority: input.goLiveOverrides?.length ? 'PLATFORM_ADMIN' : null,
        }
      : {}),
    ...(decision.action === 'Event.Reopen'
      ? { platformAdmin: true, closedAt: snapshot.closedAt?.toISOString(), reopenHours: 48 }
      : {}),
    blockers: [],
  };
}

/** Guard results and post-commit cache delivery describe the same saved version. */
export async function recordLifecycleTransition(
  tx: PrismaTransactionClient,
  input: LifecycleAuditInput,
): Promise<void> {
  const { scope, audit, before, after, decision, closedWindows, reason } = input;
  await writeAudit(tx, {
    ...audit,
    action: 'event.transition',
    entityType: 'Event',
    entityId: scope.eventId,
    before: { status: before.status, version: before.lifecycleVersion },
    after: {
      status: after.status,
      version: after.lifecycleVersion,
      action: decision.action,
      guardResults: guardResults(input),
      effects: [...decision.effects],
      closedWindows,
      ...(input.closeOut
        ? { closeOut: input.closeOut, closedAt: after.closedAt?.toISOString() }
        : {}),
      reason: reason ?? null,
      ...(input.reopen ? { reopen: input.reopen } : {}),
      ...(input.archive
        ? { archive: input.archive, archivedAt: after.archivedAt?.toISOString() }
        : {}),
    },
  });
  if (input.archive) await publishCacheEvent(tx, 'membership', { eventId: scope.eventId });
  await publishCacheEvent(tx, 'event.state', {
    eventId: scope.eventId,
    status: after.status,
    version: after.lifecycleVersion,
  });
}
