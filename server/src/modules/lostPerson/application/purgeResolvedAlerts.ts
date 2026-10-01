import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../../platform/http/auditContext.js';
import { allEventScopes } from '../../../platform/event/events.js';
import { logger } from '../../../platform/logger/index.js';
import { getSettings } from '../../../platform/settings/index.js';
import { minutesBetween } from '../../../platform/time/index.js';
import { findPurgeCandidates, purgeAlert, scrubLegacyReplay } from '../data/repo.js';
import { purgeCutoff } from '../domain/alertRules.js';
import { RAISE_ENDPOINT } from './constants.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

type Candidate = Awaited<ReturnType<typeof findPurgeCandidates>>[number];

/**
 * Summarise one alert and null its description, in one transaction, so an
 * alert can never end up both un-summarised and stripped of what the summary
 * is derived from.
 */
async function purgeOne(
  scope: EventScope,
  alert: Candidate & { resolvedAt: Date; status: 'RESOLVED_FOUND' | 'RESOLVED_OTHER' },
) {
  const outcome = alert.status;
  return prisma.$transaction(async (tx) => {
    const claimed = await purgeAlert(tx, scope, {
      id: alert.id,
      rehearsal: alert.rehearsal,
      raisedAt: alert.raisedAt,
      resolvedAt: alert.resolvedAt,
      outcome,
      ackCount: alert._count.acknowledgements,
      resolutionMinutes: minutesBetween(alert.raisedAt, alert.resolvedAt),
    });
    if (!claimed) return false;
    await scrubLegacyReplay(tx, { endpoint: RAISE_ENDPOINT, alertId: alert.id });
    await writeAudit(tx, {
      ...SYSTEM_AUDIT_CONTEXT,
      eventId: scope.eventId,
      action: 'lostPerson.purge',
      entityType: 'LostPersonAlert',
      entityId: alert.id,
      after: { purged: true },
    });
    return true;
  });
}

/**
 * The purge job (BUILD_PLAN §5.9). Runs every 15 minutes and on demand: every
 * resolved alert past the retention window is reduced to its summary.
 */
/** One event's resolved alerts past the retention window. */
async function purgeEvent(scope: EventScope, cutoff: Date): Promise<number> {
  let purged = 0;
  for (const alert of await findPurgeCandidates(scope, cutoff)) {
    // Defensive: the query already filters on these, but the purge is the one
    // operation that destroys data and it should not rely on a filter alone.
    if (alert.status === 'ACTIVE' || !alert.resolvedAt) continue;
    // Another worker may have purged it first; only this worker's purges count.
    const candidate = { ...alert, resolvedAt: alert.resolvedAt, status: alert.status };
    if (await purgeOne(scope, candidate)) purged += 1;
  }
  return purged;
}

export async function purgeResolvedAlerts(now = new Date()): Promise<number> {
  const cutoff = purgeCutoff(now, getSettings().lostPersonPurgeHours);
  let purged = 0;
  for (const scope of await allEventScopes()) purged += await purgeEvent(scope, cutoff);

  if (purged > 0) logger.info({ purged }, 'purged resolved lost-person alerts');
  return purged;
}
