import type { SwapRequestRecord } from '@spoh/shared';
import { toSwapRecord } from '../data/mappers.js';
import { listSwaps } from '../data/repo.js';

/** Swaps this volunteer asked for, or was asked to take. */
export async function listMySwaps(volunteerId: string): Promise<SwapRequestRecord[]> {
  return (await listSwaps({ volunteerId })).map(toSwapRecord);
}

/** Everything awaiting a decision — the IC's queue. */
export async function listPendingSwaps(): Promise<SwapRequestRecord[]> {
  return (await listSwaps({ status: 'REQUESTED' })).map(toSwapRecord);
}
