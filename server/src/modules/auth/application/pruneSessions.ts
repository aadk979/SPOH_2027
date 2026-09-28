import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { logger } from '../../../platform/logger/index.js';
import { deleteStaleSessions } from '../data/repo.js';
import { REVOKED_RETENTION_MS } from '../domain/sessionRules.js';

/**
 * Housekeeping. Expired and long-revoked rows carry no value and the table is
 * written to on every refresh, so it is the one that grows fastest.
 */
export async function pruneRefreshSessions(now: Date = new Date()): Promise<number> {
  const count = await deleteStaleSessions(now, new Date(now.getTime() - REVOKED_RETENTION_MS));

  if (count > 0) {
    invalidateVolunteerCache();
    logger.info({ removed: count }, 'pruned expired refresh sessions');
  }

  return count;
}
