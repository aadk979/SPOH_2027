import type { CancelCategoryScheduleRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { settleReserved } from '../../../platform/idempotency/index.js';
import { fixedClock } from '../../../platform/time/index.js';
import { cancelCategoryScheduleRow } from '../data/categoryScheduleMutationRepo.js';
import type { CategoryScheduleActor } from './categoryAuthority.js';
import { categoryScheduleResponse } from './categoryScheduleResponse.js';
import { lockPendingCategorySchedule } from './lockPendingCategorySchedule.js';

export function cancelCategorySchedule(
  input: { categoryId: string; id: string; request: CancelCategoryScheduleRequest },
  actor: CategoryScheduleActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const prepared = await lockPendingCategorySchedule(tx, {
        categoryId: input.categoryId,
        id: input.id,
        ...input.request,
        actor,
      });
      const { idempotencyKey, ...request } = input.request;
      const row = await cancelCategoryScheduleRow(actor.scope, {
        tx,
        id: input.id,
        version: prepared.row.version,
        now: prepared.now,
      });
      await writeAudit(tx, {
        ...actor.audit,
        source: 'USER',
        action: 'schedule.cancel',
        entityType: 'ScheduledAction',
        entityId: row.id,
        before: { version: prepared.row.version, status: prepared.row.status },
        after: { version: row.version, status: row.status, request },
      });
      await settleReserved(tx, actor.scope, {
        key: idempotencyKey,
        statusCode: 200,
        body: {
          scheduledActionId: row.id,
          categoryId: input.categoryId,
          mutationVersion: row.version,
        },
      });
      return categoryScheduleResponse(tx, {
        row,
        categoryId: input.categoryId,
        eventStatus: prepared.event.status,
        actor: { ...actor, clock: fixedClock(prepared.now) },
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
