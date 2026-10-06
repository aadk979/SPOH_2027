import { CategoryScheduleCreationIntent, type CreateCategoryScheduleRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { settleReserved } from '../../../platform/idempotency/index.js';
import { fixedClock } from '../../../platform/time/index.js';
import { insertCategorySchedule } from '../data/categoryScheduleRepo.js';
import type { CategoryScheduleActor } from './categoryAuthority.js';
import { categoryScheduleResponse } from './categoryScheduleResponse.js';
import { prepareCategorySchedule } from './prepareCategorySchedule.js';

export function createCategorySchedule(
  input: { categoryId: string; request: CreateCategoryScheduleRequest },
  actor: CategoryScheduleActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const { idempotencyKey, ...review } = input.request;
      const intent = CategoryScheduleCreationIntent.parse({
        ...review,
        categoryId: input.categoryId,
      });
      const prepared = await prepareCategorySchedule(tx, { intent, actor, idempotencyKey });
      const row = await insertCategorySchedule(actor.scope, {
        tx,
        intent,
        personId: actor.volunteerId,
        now: prepared.now,
      });
      await writeAudit(tx, {
        ...actor.audit,
        source: 'USER',
        action: 'schedule.create',
        entityType: 'ScheduledAction',
        entityId: row.id,
        after: { version: 1, intent },
      });
      await settleReserved(tx, actor.scope, {
        key: idempotencyKey,
        statusCode: 201,
        body: { scheduledActionId: row.id, categoryId: input.categoryId },
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
