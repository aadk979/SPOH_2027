import type { GiftTypeRecord } from '@spoh/shared';
import { toGiftTypeRecord } from '../data/mappers.js';
import { giftTotals, listGiftTypes } from '../data/repo.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Every active gift type with its derived stock. */
export async function listGifts(scope: EventScope): Promise<GiftTypeRecord[]> {
  const [gifts, totals] = await Promise.all([listGiftTypes(scope), giftTotals(scope)]);
  return gifts.map((gift) =>
    toGiftTypeRecord(gift, totals.get(gift.id) ?? { redeemed: 0, adjustment: 0 }),
  );
}
