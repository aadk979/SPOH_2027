import type { SwapRequestRecord } from '@spoh/shared';
import { toSwapRecord } from '../data/mappers.js';
import { listSwaps } from '../data/repo.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Swaps this volunteer asked for, or was asked to take. */
export async function listMySwaps(
  scope: EventScope,
  volunteerId: string,
): Promise<SwapRequestRecord[]> {
  return (await listSwaps(scope, { volunteerId })).map(toSwapRecord);
}

/** Everything awaiting a decision — the IC's queue. */
export async function listPendingSwaps(scope: EventScope): Promise<SwapRequestRecord[]> {
  return (await listSwaps(scope, { status: 'REQUESTED' })).map(toSwapRecord);
}
