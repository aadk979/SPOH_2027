import type { StampCardRequest, StampCardResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';
type StampInput = Omit<StampCardRequest, 'acknowledgeDuplicate'> & {
  acknowledgeDuplicate?: boolean;
};
export function stampCard(shortCode: string, body: StampInput): Promise<StampCardResponse> {
  return api<StampCardResponse>(`/cards/${shortCode}/stamps`, { method: 'POST', body });
}
