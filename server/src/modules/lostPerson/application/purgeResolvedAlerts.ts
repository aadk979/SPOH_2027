import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../../platform/http/auditContext.js';
import { allEventScopes } from '../../../platform/event/events.js';
import { logger } from '../../../platform/logger/index.js';
import { minutesBetween, systemClock } from '../../../platform/time/index.js';
import { findPurgeCandidates, purgeAlert, scrubLegacyReplay } from '../data/repo.js';
import { purgeCutoff } from '../domain/alertRules.js';
import { RAISE_ENDPOINT } from './constants.js';
import { lostPersonRetentionHours } from './retentionPolicy.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** One event's descriptions, summaries and receipts share the caller's transaction. */
export async function purgeResolvedAlertsInTransaction(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { now: Date; audit: AuditContext },
): Promise<number> {
  const event = await holdCaptureEvent(tx, scope);
  const hours = await lostPersonRetentionHours(tx, {
    ...scope,
    organisationId: event.organisationId,
  });
  const candidates = await findPurgeCandidates(tx, scope, purgeCutoff(input.now, hours));
  let purged = 0;
  for (const alert of candidates) {
    if (alert.status === 'ACTIVE' || !alert.resolvedAt) continue;
    const claimed = await purgeAlert(tx, scope, {
      id: alert.id,
      rehearsal: alert.rehearsal,
      raisedAt: alert.raisedAt,
      resolvedAt: alert.resolvedAt,
      outcome: alert.status,
      ackCount: alert._count.acknowledgements,
      resolutionMinutes: minutesBetween(alert.raisedAt, alert.resolvedAt),
      purgedAt: input.now,
    });
    if (!claimed) continue;
    await scrubLegacyReplay(tx, scope, { endpoint: RAISE_ENDPOINT, alertId: alert.id });
    await writeAudit(tx, {
      ...input.audit,
      eventId: scope.eventId,
      action: 'lostPerson.purge',
      entityType: 'LostPersonAlert',
      entityId: alert.id,
      after: { purged: true },
    });
    purged += 1;
  }
  return purged;
}

/** Manual/system compatibility entry point; each event is atomic without nested transactions. */
export async function purgeResolvedAlerts(now = systemClock.now()): Promise<number> {
  let purged = 0;
  for (const scope of await allEventScopes()) {
    purged += await prisma.$transaction(
      (tx) => purgeResolvedAlertsInTransaction(tx, scope, { now, audit: SYSTEM_AUDIT_CONTEXT }),
      { isolationLevel: 'ReadCommitted', timeout: 30_000 },
    );
  }
  if (purged > 0) logger.info({ purged }, 'purged resolved lost-person alerts');
  return purged;
}
