import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../../platform/http/auditContext.js';
import { logger } from '../../../platform/logger/index.js';
import { getSettings } from '../../../platform/settings/index.js';
import { minutesBetween } from '../../../platform/time/index.js';
import { findPurgeCandidates, purgeAlert, scrubLegacyReplay } from '../data/repo.js';
import { purgeCutoff } from '../domain/alertRules.js';
import { RAISE_ENDPOINT } from './constants.js';

type Candidate = Awaited<ReturnType<typeof findPurgeCandidates>>[number];

/**
 * Summarise one alert and null its description, in one transaction, so an
 * alert can never end up both un-summarised and stripped of what the summary
 * is derived from.
 */
async function purgeOne(
  alert: Candidate & { resolvedAt: Date },
  outcome: 'RESOLVED_FOUND' | 'RESOLVED_OTHER',
) {
  await prisma.$transaction(async (tx) => {
    await purgeAlert(tx, {
      id: alert.id,
      raisedAt: alert.raisedAt,
      resolvedAt: alert.resolvedAt,
      outcome,
      ackCount: alert._count.acknowledgements,
      resolutionMinutes: minutesBetween(alert.raisedAt, alert.resolvedAt),
    });
    await scrubLegacyReplay(tx, { endpoint: RAISE_ENDPOINT, alertId: alert.id });
    await writeAudit(tx, {
      ...SYSTEM_AUDIT_CONTEXT,
      action: 'lostPerson.purge',
      entityType: 'LostPersonAlert',
      entityId: alert.id,
      after: { purged: true },
    });
  });
}

/**
 * The purge job (BUILD_PLAN §5.9). Runs every 15 minutes and on demand: every
 * resolved alert past the retention window is reduced to its summary.
 */
export async function purgeResolvedAlerts(now = new Date()): Promise<number> {
  const candidates = await findPurgeCandidates(
    purgeCutoff(now, getSettings().lostPersonPurgeHours),
  );
  let purged = 0;

  for (const alert of candidates) {
    // Defensive: the query already filters on these, but the purge is the one
    // operation that destroys data and it should not rely on a filter alone.
    if (alert.status === 'ACTIVE' || !alert.resolvedAt) continue;
    await purgeOne({ ...alert, resolvedAt: alert.resolvedAt }, alert.status);
    purged += 1;
  }

  if (purged > 0) logger.info({ purged }, 'purged resolved lost-person alerts');
  return purged;
}
