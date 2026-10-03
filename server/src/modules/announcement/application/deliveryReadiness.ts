import type { AnnouncementPushDeliveryError } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { eventDayAnchorOf } from '../../../platform/time/index.js';
import { TTL_SECONDS } from '../../notification/index.js';
import {
  currentDeliveryRecipient,
  currentDeliverySubscription,
  type DeliverySubscription,
  type LockedDelivery,
} from '../data/deliveryExecutionRepo.js';
import { deliveryDeadlineMs } from '../domain/deliveryDeadline.js';
import { audienceOf } from '../domain/audience.js';

function sourceRefusal(locked: LockedDelivery): AnnouncementPushDeliveryError | null {
  const { row, event, now } = locked;
  if (event.status === 'ARCHIVED') return 'ARCHIVED';
  if (row.plan.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (
    row.plan.announcement.priority !== 'URGENT' ||
    row.plan.expiresAt.getTime() !==
      deliveryDeadlineMs(row.plan.announcement, TTL_SECONDS['announcement.urgent'])
  )
    return 'SOURCE_CHANGED';
  return null;
}

type ReadyDevice =
  | { refusal: AnnouncementPushDeliveryError; device: null }
  | { refusal: null; device: DeliverySubscription };
export async function deliveryReadiness(
  tx: PrismaTransactionClient,
  locked: LockedDelivery,
): Promise<ReadyDevice> {
  const refusal = sourceRefusal(locked);
  if (refusal) return { refusal, device: null };
  const recipient = await currentDeliveryRecipient(tx, {
    locked,
    audience: audienceOf(locked.row.plan.announcement),
    today: eventDayAnchorOf(locked.now, locked.event),
  });
  if (recipient.member?.status !== 'ACTIVE') return { refusal: 'RECIPIENT_INACTIVE', device: null };
  if (!recipient.eligible) return { refusal: 'RECIPIENT_OUT_OF_SCOPE', device: null };
  const { row } = locked;
  const device = row.subscriptionId
    ? await currentDeliverySubscription(tx, row.subscriptionId)
    : null;
  if (!device) return { refusal: 'SUBSCRIPTION_GONE', device: null };
  if (device.volunteerId !== row.recipientPersonId)
    return { refusal: 'SUBSCRIPTION_REASSIGNED', device: null };
  return { refusal: null, device };
}
