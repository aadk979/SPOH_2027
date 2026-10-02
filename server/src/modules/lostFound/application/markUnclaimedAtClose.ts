import { writeAudit } from '../../../platform/audit/index.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { markHeldUnclaimed } from '../data/repo.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

/**
 * Close out everything still held at the end of the event, so the post-event
 * report can state the outcome of every case rather than leaving a pile of
 * items in an indefinite "held".
 */
export async function markUnclaimedAtClose({ scope, audit }: ActorContext): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await holdCaptureEvent(tx, scope);
    return markUnclaimedInTransaction(tx, { scope, audit });
  });
}

/** Lifecycle close-out uses the owning transaction, including the found-item audit. */
export async function markUnclaimedInTransaction(
  tx: PrismaTransactionClient,
  { scope, audit }: Pick<ActorContext, 'scope' | 'audit'>,
): Promise<number> {
  const count = await markHeldUnclaimed(tx, scope);
  if (count > 0) {
    await writeAudit(tx, {
      ...audit,
      action: 'lostFound.closeOut',
      entityType: 'LostFoundItem',
      entityId: null,
      after: { markedUnclaimedAtClose: count },
    });
  }
  return count;
}
