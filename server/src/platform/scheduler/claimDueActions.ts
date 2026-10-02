import { prisma } from '../db/client.js';
import { systemClock, type Clock } from '../time/index.js';
import { claimActions } from './claimRepo.js';

/** ADR-004's short claim commits before any event or handler lock is acquired. */
export async function claimDueActions(input: {
  workerId: string;
  types: readonly string[];
  clock?: Clock;
}) {
  if (!input.workerId.trim()) throw new Error('A scheduler worker ID is required');
  if (input.types.length === 0) return [];
  const now = (input.clock ?? systemClock).now();
  const leaseUntil = new Date(now.getTime() + 5 * 60_000);
  return prisma.$transaction((tx) => claimActions(tx, { ...input, now, leaseUntil }), {
    isolationLevel: 'ReadCommitted',
    timeout: 5_000,
  });
}
