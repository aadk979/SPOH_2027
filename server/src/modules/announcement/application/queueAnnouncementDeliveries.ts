import { ERROR_CODES } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { eventDayAnchorOf } from '../../../platform/time/index.js';
import { TTL_SECONDS } from '../../notification/index.js';
import {
  createDeliveryPlan,
  createDeviceDeliveries,
  findDeliveryPlan,
  findDeliveryRecipients,
} from '../data/deliveryPlanRepo.js';
import { audienceOf } from '../domain/audience.js';
import { deliveryDeadlineMs } from '../domain/deliveryDeadline.js';
import { prepareDeliveryPlan, type QueueDeliveryInput } from './prepareDeliveryPlan.js';

/** Durable storage only: never opens a nested transaction, dispatches or copies push secrets. */
export async function queueAnnouncementDeliveries(scope: EventScope, input: QueueDeliveryInput) {
  const { source, event, now } = await prepareDeliveryPlan(scope, input);
  if (source.priority !== 'URGENT') return { plan: null, created: false };
  const existing = await findDeliveryPlan(scope, input);
  if (existing) return { plan: existing, created: false };
  const deadlineMs = deliveryDeadlineMs(source, TTL_SECONDS['announcement.urgent']);
  if (deadlineMs <= now.getTime()) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The announcement delivery lifetime has expired.',
    );
  }
  const recipients = await findDeliveryRecipients(scope, {
    tx: input.tx,
    audience: audienceOf(source),
    today: eventDayAnchorOf(now, event),
  });
  const plan = await createDeliveryPlan(scope, { ...input, recipients, now, deadlineMs });
  await createDeviceDeliveries(scope, { tx: input.tx, planId: plan.id, recipients, now });
  await writeAudit(input.tx, {
    ...input.audit,
    action: 'announcement.delivery.enqueue',
    entityType: 'AnnouncementDeliveryPlan',
    entityId: plan.id,
    after: {
      announcementId: source.id,
      recipientCount: plan.recipientCount,
      deviceCount: plan.deviceCount,
    },
  });
  return { plan, created: true };
}
