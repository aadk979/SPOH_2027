import type { GiftTypeRecord, RedeemGiftRequest, RedeemGiftResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
import type {
  CreateGiftTypeRequest,
  UpdateGiftTypeRequest,
  AdjustGiftStockWithReceiptRequest,
} from '@spoh/shared';
export async function listGiftCatalogue(eventId: string): Promise<GiftTypeRecord[]> {
  return (await eventApi<{ data: GiftTypeRecord[] }>(eventId, '/gifts/catalogue')).data;
}
export async function createGiftType(eventId: string, body: CreateGiftTypeRequest) {
  return (
    await eventApi<{ giftType: GiftTypeRecord }>(eventId, '/admin/gift-types', {
      method: 'POST',
      body,
    })
  ).giftType;
}
export async function updateGiftType(
  eventId: string,
  change: { id: string; body: UpdateGiftTypeRequest },
) {
  return (
    await eventApi<{ giftType: GiftTypeRecord }>(
      eventId,
      `/admin/gift-types/${encodeURIComponent(change.id)}`,
      { method: 'PATCH', body: change.body },
    )
  ).giftType;
}
export async function adjustGiftStock(
  eventId: string,
  change: { id: string; body: AdjustGiftStockWithReceiptRequest },
) {
  return (
    await eventApi<{ giftType: GiftTypeRecord }>(
      eventId,
      `/gifts/${encodeURIComponent(change.id)}/stock`,
      { method: 'POST', body: change.body },
    )
  ).giftType;
}
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
