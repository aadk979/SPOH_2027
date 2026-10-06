import type { EventStatus } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { settleReserved } from '../../../platform/idempotency/index.js';
import { fixedClock } from '../../../platform/time/index.js';
import type { CategoryScheduleRow } from '../data/categoryScheduleRepo.js';
import type { CategoryScheduleActor } from './categoryAuthority.js';
import { categoryScheduleResponse } from './categoryScheduleResponse.js';

/** Receipt and fresh response remain inside the same effect transaction. */
export async function finishCategoryScheduleMutation(
  tx: PrismaTransactionClient,
  input: {
    row: CategoryScheduleRow;
    actor: CategoryScheduleActor;
    categoryId: string;
    eventStatus: EventStatus;
    now: Date;
    idempotencyKey: string;
  },
) {
  await settleReserved(tx, input.actor.scope, {
    key: input.idempotencyKey,
    statusCode: 200,
    body: {
      scheduledActionId: input.row.id,
      categoryId: input.categoryId,
      mutationVersion: input.row.version,
    },
  });
  return categoryScheduleResponse(tx, {
    row: input.row,
    categoryId: input.categoryId,
    eventStatus: input.eventStatus,
    actor: { ...input.actor, clock: fixedClock(input.now) },
  });
}
