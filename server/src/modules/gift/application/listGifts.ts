import type { GiftTypeRecord } from '@spoh/shared';
import { toGiftTypeRecord } from '../data/mappers.js';
import { giftTotals, listGiftTypes } from '../data/repo.js';

/** Every active gift type with its derived stock. */
export async function listGifts(): Promise<GiftTypeRecord[]> {
  const [gifts, totals] = await Promise.all([listGiftTypes(), giftTotals()]);
  return gifts.map((gift) =>
    toGiftTypeRecord(gift, totals.get(gift.id) ?? { redeemed: 0, adjustment: 0 }),
  );
}
