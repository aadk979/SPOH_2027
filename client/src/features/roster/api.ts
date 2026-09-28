import type { SwapRequestRecord } from '@spoh/shared';
import { api } from '@/shared/lib/api';
export async function listPendingSwaps(): Promise<SwapRequestRecord[]> {
  return (await api<{ data: SwapRequestRecord[] }>('/roster/swaps/pending')).data;
}
export function decideSwap(input: {
  id: string;
  decision: 'APPROVED' | 'REJECTED';
}): Promise<unknown> {
  return api(`/roster/swaps/${input.id}/decide`, {
    method: 'POST',
    body: { decision: input.decision },
  });
}
