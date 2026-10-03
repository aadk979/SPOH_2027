import { prisma } from '../../../platform/db/client.js';
import type { Clock } from '../../../platform/time/index.js';
import type { DevicePushInput } from '../../notification/index.js';
import type { ClaimedDelivery } from '../data/deliveryClaimRepo.js';
import {
  finishDelivery,
  lockClaimedDelivery,
  type LockedDelivery,
  type DeliverySubscription,
  reserveDeliverySend,
} from '../data/deliveryExecutionRepo.js';
import { pushPreview } from '../domain/sendRules.js';
import { deliveryReadiness } from './deliveryReadiness.js';

function sendSnapshot(locked: LockedDelivery, device: DeliverySubscription) {
  const { row, event } = locked;
  const input: Omit<DevicePushInput, 'ttlSeconds'> = {
    target: { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
    payload: {
      title: 'Urgent announcement',
      body: pushPreview(row.plan.announcement.body),
      url: `/e/${encodeURIComponent(event.slug)}/inbox`,
      tag: `announcement:${row.plan.announcementId}`,
      kind: 'announcement.urgent',
      priority: 'URGENT',
    },
  };
  return { kind: 'SEND', input, device, expiresAt: row.plan.expiresAt } as const;
}

/** Checks current eligibility in a short transaction, then returns only an in-memory send snapshot. */
export async function prepareClaimedDelivery(claim: ClaimedDelivery, clock: Clock) {
  return prisma.$transaction(
    async (tx) => {
      const locked = await lockClaimedDelivery(tx, claim, () => clock.now());
      if (!locked) return { kind: 'STALE' } as const;
      const { now } = locked;
      if (claim.exhausted)
        return {
          kind: await finishDelivery(tx, {
            claim,
            now,
            outcome: { status: 'DEAD', lastError: 'RETRY_EXHAUSTED' },
          }),
        } as const;
      const readiness = await deliveryReadiness(tx, locked);
      if (readiness.refusal)
        return {
          kind: await finishDelivery(tx, {
            claim,
            now,
            outcome: { status: 'SKIPPED', lastError: readiness.refusal },
          }),
        } as const;
      return {
        ...sendSnapshot(locked, readiness.device),
        claim: await reserveDeliverySend(tx, claim),
      };
    },
    { isolationLevel: 'ReadCommitted', timeout: 5_000 },
  );
}
