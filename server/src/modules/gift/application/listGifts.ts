import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import type { GiftTypeRecord } from '@spoh/shared';
import { toGiftTypeRecord } from '../data/mappers.js';
import { giftTotals, listGiftTypes } from '../data/repo.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Every active gift type with its derived stock. */
export async function listGifts(
  scope: EventScope & { rehearsal?: boolean },
): Promise<GiftTypeRecord[]> {
  const rehearsal = scope.rehearsal ?? (await captureProvenance(prisma, scope)).rehearsal;
  const [gifts, totals] = await Promise.all([
    listGiftTypes(scope),
    giftTotals({ ...scope, rehearsal }),
  ]);
  return gifts.map((gift) =>
    toGiftTypeRecord(gift, totals.get(gift.id) ?? { redeemed: 0, adjustment: 0, rehearsal }),
  );
}
