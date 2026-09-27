import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { markHeldUnclaimed } from '../data/repo.js';

/**
 * Close out everything still held at the end of the event, so the post-event
 * report can state the outcome of every case rather than leaving a pile of
 * items in an indefinite "held".
 */
export async function markUnclaimedAtClose(audit: AuditContext): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const count = await markHeldUnclaimed(tx);
    if (count > 0) {
      await writeAudit(tx, {
        ...audit,
        action: 'lostFound.claim',
        entityType: 'LostFoundItem',
        entityId: null,
        after: { markedUnclaimedAtClose: count },
      });
    }
    return count;
  });
}
