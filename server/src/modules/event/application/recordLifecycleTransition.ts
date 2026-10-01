import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { publishCacheEvent } from '../../../platform/events/cacheBus.js';
import type { LifecycleEvent, LifecycleStateRow } from '../data/lifecycleRepo.js';
import type { LifecycleSnapshot, TransitionEvaluation } from '../domain/lifecycle.js';

/** Guard results and post-commit cache delivery describe the same saved version. */
export async function recordLifecycleTransition(
  tx: PrismaTransactionClient,
  input: {
    scope: EventScope;
    audit: AuditContext;
    before: LifecycleEvent;
    after: LifecycleStateRow;
    snapshot: LifecycleSnapshot;
    decision: TransitionEvaluation;
    closedWindows: string[];
    reason?: string;
  },
): Promise<void> {
  const { scope, audit, before, after, snapshot, decision, closedWindows, reason } = input;
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
      guardResults: {
        structure: snapshot.structure,
        hasBeenLive: snapshot.hasBeenLive,
        blockers: [],
      },
      effects: [...decision.effects],
      closedWindows,
      reason: reason ?? null,
    },
  });
  await publishCacheEvent(tx, 'event.state', {
    eventId: scope.eventId,
    status: after.status,
    version: after.lifecycleVersion,
  });
}
