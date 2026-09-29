import type { ClaimLostFoundRequest, LostFoundRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findItemRow, markClaimed } from '../data/repo.js';
import { assertNotClaimed } from '../domain/itemRules.js';
import { toRecordWithStation } from './itemRecord.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

/** Hand an item back. A claim is a status change; the claimant is never recorded. */
export async function claimItem(
  itemId: string,
  request: ClaimLostFoundRequest,
  { scope, audit }: ActorContext,
): Promise<LostFoundRecord> {
  const claimed = await prisma.$transaction(async (tx) => {
    const existing = await findItemRow(tx, itemId);
    if (!existing) throw new NotFoundError('Lost and found item');
    assertNotClaimed(existing);

    const row = await markClaimed(tx, { id: itemId, at: new Date(), note: request.note });
    await writeAudit(tx, {
      ...audit,
      action: 'lostFound.claim',
      entityType: 'LostFoundItem',
      entityId: itemId,
      before: { status: existing.status },
      after: { status: 'CLAIMED' },
    });
    return row;
  });

  return toRecordWithStation(scope, claimed);
}
