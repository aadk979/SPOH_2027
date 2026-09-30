import type { StampCardRequest, StampCardResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
type StampInput = Omit<StampCardRequest, 'acknowledgeDuplicate'> & {
  acknowledgeDuplicate?: boolean;
};
export const cardEndpoints = {
  stamps: (shortCode: string) => `/cards/${shortCode}/stamps`,
} as const;
export function stampCard(
  eventId: string,
  shortCode: string,
  body: StampInput,
): Promise<StampCardResponse> {
  return eventApi<StampCardResponse>(eventId, cardEndpoints.stamps(shortCode), {
    method: 'POST',
    body,
  });
}
