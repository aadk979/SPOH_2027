import type { StampCardRequest, StampCardResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';
type StampInput = Omit<StampCardRequest, 'acknowledgeDuplicate'> & {
  acknowledgeDuplicate?: boolean;
};
export const cardEndpoints = {
  stamps: (shortCode: string) => `/cards/${shortCode}/stamps`,
} as const;
export function stampCard(shortCode: string, body: StampInput): Promise<StampCardResponse> {
  return api<StampCardResponse>(cardEndpoints.stamps(shortCode), { method: 'POST', body });
}
