import type { GiftTypeRecord, RedeemGiftRequest, RedeemGiftResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export async function listGifts(eventId: string): Promise<GiftTypeRecord[]> {
  return (await eventApi<{ data: GiftTypeRecord[] }>(eventId, '/gifts')).data;
}
// The server supplies this schema default; omitting it preserves the existing wire payload.
export type RedemptionInput = Omit<RedeemGiftRequest, 'acknowledgeWarning' | 'queued'> & {
  acknowledgeWarning?: boolean;
  queued?: boolean;
};
export const giftEndpoints = { redemptions: '/gifts/redemptions' } as const;
export function redeemGift(eventId: string, body: RedemptionInput): Promise<RedeemGiftResponse> {
  return eventApi<RedeemGiftResponse>(eventId, giftEndpoints.redemptions, { method: 'POST', body });
}
