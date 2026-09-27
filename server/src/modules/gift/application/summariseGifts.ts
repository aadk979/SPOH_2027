import type { GiftSummaryQuery, GiftSummaryResponse } from '@spoh/shared';
import { rangeOverlapsFallbackWindow } from '../../fallback/index.js';
import { summariseRedemptions } from '../data/repo.js';
import { listGifts } from './listGifts.js';

export async function summariseGifts(query: GiftSummaryQuery): Promise<GiftSummaryResponse> {
  const filter = {
    ...(query.stationId ? { stationId: query.stationId } : {}),
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
  };

  const [rows, gifts, containsFallbackData] = await Promise.all([
    summariseRedemptions(filter),
    listGifts(),
    rangeOverlapsFallbackWindow(filter),
  ]);
  const counts = new Map(rows.map((row) => [row.giftTypeId, row.count]));

  return {
    unit: 'redemptions',
    total: rows.reduce((sum, row) => sum + row.count, 0),
    byGiftType: gifts.map((gift) => ({
      giftTypeId: gift.id,
      giftTypeName: gift.name,
      redeemed: counts.get(gift.id) ?? 0,
      remaining: gift.remaining,
    })),
    containsFallbackData,
  };
}
