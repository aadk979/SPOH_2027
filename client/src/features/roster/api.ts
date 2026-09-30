import type { SwapRequestRecord } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export async function listPendingSwaps(eventId: string): Promise<SwapRequestRecord[]> {
  return (await eventApi<{ data: SwapRequestRecord[] }>(eventId, '/roster/swaps/pending')).data;
}
export function decideSwap(
  eventId: string,
  input: {
    id: string;
    decision: 'APPROVED' | 'REJECTED';
  },
): Promise<unknown> {
  return eventApi(eventId, `/roster/swaps/${input.id}/decide`, {
    method: 'POST',
    body: { decision: input.decision },
  });
}
