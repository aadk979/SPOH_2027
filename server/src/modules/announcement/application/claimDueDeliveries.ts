import { prisma } from '../../../platform/db/client.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { claimRows } from '../data/deliveryClaimRepo.js';

/** Global technical claim commits before any event lock, body lookup or external send. */
export function claimDueDeliveries(input: { workerId: string; clock?: Clock }) {
  if (!input.workerId.trim() || input.workerId.length > 128)
    throw new Error('A bounded delivery worker ID is required');
  const now = (input.clock ?? systemClock).now();
  return prisma.$transaction(
    (tx) =>
      claimRows(tx, {
        workerId: input.workerId,
        now,
        leaseUntil: new Date(now.getTime() + 5 * 60_000),
      }),
    { isolationLevel: 'ReadCommitted', timeout: 5_000 },
  );
}
