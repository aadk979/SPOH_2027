import { logger } from '../../../platform/logger/index.js';
import type { Clock } from '../../../platform/time/index.js';
import { claimDueDeliveries } from './claimDueDeliveries.js';
import { executeClaimedDelivery } from './executeClaimedDelivery.js';

/** Five bounded device attempts per non-overlapping scheduler tick; DB failures retain the lease. */
export async function deliverAnnouncementBatch(input: { workerId: string; clock?: Clock }) {
  const claims = await claimDueDeliveries(input);
  for (const claim of claims) {
    try {
      await executeClaimedDelivery({ claim, clock: input.clock });
    } catch {
      logger.error({ code: 'ANNOUNCEMENT_DELIVERY_FAILED' }, 'announcement delivery failed');
    }
  }
}
