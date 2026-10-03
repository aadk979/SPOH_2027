import { logger } from '../../../platform/logger/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import {
  sendDevicePush,
  type DevicePushInput,
  type DevicePushResult,
} from '../../notification/index.js';
import type { ClaimedDelivery } from '../data/deliveryClaimRepo.js';
import { pruneUnchangedGoneDevice } from '../data/deliveryExecutionRepo.js';
import { prepareClaimedDelivery } from './prepareClaimedDelivery.js';
import { recordDeliveryOutcome } from './recordDeliveryOutcome.js';

export async function executeClaimedDelivery(input: {
  claim: ClaimedDelivery;
  clock?: Clock;
  send?: (input: DevicePushInput) => Promise<DevicePushResult>;
}) {
  const clock = input.clock ?? systemClock;
  const prepared = await prepareClaimedDelivery(input.claim, clock);
  if (prepared.kind !== 'SEND') return prepared.kind;
  const now = clock.now();
  if (now.getTime() > prepared.claim.lockedUntil.getTime()) return 'STALE' as const;
  const ttlSeconds = Math.floor((prepared.expiresAt.getTime() - now.getTime()) / 1000);
  if (ttlSeconds <= 0) return recordDeliveryOutcome(prepared.claim, clock, 'EXPIRED');
  let result: DevicePushResult;
  try {
    result = await (input.send ?? sendDevicePush)({ ...prepared.input, ttlSeconds });
  } catch {
    result = 'FAILED';
  }
  const status = await recordDeliveryOutcome(prepared.claim, clock, result);
  if (result === 'GONE' && status === 'SKIPPED') {
    try {
      await pruneUnchangedGoneDevice(prepared.device);
    } catch {
      logger.error(
        { code: 'ANNOUNCEMENT_DEVICE_PRUNE_FAILED' },
        'announcement device pruning failed',
      );
    }
  }
  return status;
}
