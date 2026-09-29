import type { GiftTypeRecord, RedeemGiftRequest, RedeemGiftResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';
export async function listGifts(): Promise<GiftTypeRecord[]> {
  return (await api<{ data: GiftTypeRecord[] }>('/gifts')).data;
}
// The server supplies this schema default; omitting it preserves the existing wire payload.
export type RedemptionInput = Omit<RedeemGiftRequest, 'acknowledgeWarning' | 'queued'> & {
  acknowledgeWarning?: boolean;
  queued?: boolean;
};
export const giftEndpoints = { redemptions: '/gifts/redemptions' } as const;
export function redeemGift(body: RedemptionInput): Promise<RedeemGiftResponse> {
  return api<RedeemGiftResponse>(giftEndpoints.redemptions, { method: 'POST', body });
}
