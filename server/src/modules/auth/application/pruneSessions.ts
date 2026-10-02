import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { logger } from '../../../platform/logger/index.js';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { publishCacheEvent } from '../../../platform/events/cacheBus.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../../platform/http/auditContext.js';
import { systemClock } from '../../../platform/time/index.js';
import { deleteStaleSessions } from '../data/repo.js';
import { REVOKED_RETENTION_MS } from '../domain/sessionRules.js';

/**
 * Housekeeping. Expired and long-revoked rows carry no value and the table is
 * written to on every refresh, so it is the one that grows fastest.
 */
export async function pruneSessionsInTransaction(
  tx: PrismaTransactionClient,
  input: { now: Date; audit: AuditContext },
): Promise<number> {
  const count = await deleteStaleSessions(tx, {
    now: input.now,
    revokedBefore: new Date(input.now.getTime() - REVOKED_RETENTION_MS),
  });
  if (count > 0) {
    await writeAudit(tx, {
      ...input.audit,
      action: 'session.prune',
      entityType: 'RefreshSession',
      entityId: null,
      after: { removed: count },
    });
    await publishCacheEvent(tx, 'session', { reason: 'prune' });
  }
  return count;
}

/** The existing manual/system entry point shares the same atomic deletion/audit boundary. */
export async function pruneRefreshSessions(now: Date = systemClock.now()): Promise<number> {
  const count = await prisma.$transaction((tx) =>
    pruneSessionsInTransaction(tx, { now, audit: SYSTEM_AUDIT_CONTEXT }),
  );

  if (count > 0) {
    invalidateVolunteerCache();
    logger.info({ removed: count }, 'pruned expired refresh sessions');
  }

  return count;
}
