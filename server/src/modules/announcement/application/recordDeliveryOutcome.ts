import { prisma } from '../../../platform/db/client.js';
import type { Clock } from '../../../platform/time/index.js';
import type { DevicePushResult } from '../../notification/index.js';
import type { ClaimedDelivery } from '../data/deliveryClaimRepo.js';
import { finishDelivery, lockClaimedDelivery } from '../data/deliveryExecutionRepo.js';
import { pushDeliveryOutcome } from '../domain/deliveryOutcome.js';

/** Fences the result after network I/O; stale workers cannot complete or prune newer claims. */
export function recordDeliveryOutcome(
  claim: ClaimedDelivery,
  clock: Clock,
  result: DevicePushResult | 'EXPIRED',
) {
  return prisma.$transaction(
    async (tx) => {
      const locked = await lockClaimedDelivery(tx, claim, () => clock.now());
      if (!locked) return 'STALE' as const;
      const outcome =
        result === 'EXPIRED'
          ? { status: 'SKIPPED' as const, lastError: 'EXPIRED' as const }
          : pushDeliveryOutcome(result, {
              now: locked.now,
              expiresAt: locked.row.plan.expiresAt,
              attempts: locked.row.attempts,
              maxAttempts: locked.row.maxAttempts,
            });
      return finishDelivery(tx, { claim, now: locked.now, outcome });
    },
    { isolationLevel: 'ReadCommitted', timeout: 5_000 },
  );
}
