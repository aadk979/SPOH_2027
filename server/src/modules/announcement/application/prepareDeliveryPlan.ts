import { ERROR_CODES } from '@spoh/shared';
import type { AuditContext } from '../../../platform/audit/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { findDeliverySource, lockDeliveryEvent } from '../data/deliveryPlanRepo.js';

export interface QueueDeliveryInput {
  tx: PrismaTransactionClient;
  announcementId: string;
  audit: AuditContext;
  clock?: Clock;
}

/** The publishing use case supplies its transaction and owns current author authority. */
export async function prepareDeliveryPlan(scope: EventScope, input: QueueDeliveryInput) {
  if (input.audit.eventId !== scope.eventId) throw new Error('Delivery audit scope mismatch');
  const event = await lockDeliveryEvent(scope, input.tx);
  if (event.status === 'ARCHIVED') {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'Archived announcements cannot request delivery.',
    );
  }
  const source = await findDeliverySource(scope, input);
  if (!source) throw new NotFoundError('Announcement');
  return { event, source, now: (input.clock ?? systemClock).now() };
}
