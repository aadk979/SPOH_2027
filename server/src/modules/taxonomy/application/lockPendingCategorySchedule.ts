import { ERROR_CODES } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { lockReserved } from '../../../platform/idempotency/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { lockCategorySchedule } from '../data/categoryScheduleMutationRepo.js';
import { lockCategoryAuthority, type CategoryScheduleActor } from './categoryAuthority.js';
import { requireCategoryActivity } from './requireCategoryActivity.js';
import { requireCategorySchedule } from './requireCategorySchedule.js';

export async function lockPendingCategorySchedule(
  tx: PrismaTransactionClient,
  input: {
    categoryId: string;
    id: string;
    expectedScheduleVersion: number;
    idempotencyKey: string;
    actor: CategoryScheduleActor;
  },
) {
  const { actor } = input;
  const event = await lockCategoryAuthority(tx, actor);
  const category = await requireCategoryActivity(tx, {
    scope: actor.scope,
    categoryId: input.categoryId,
  });
  const supported = await requireCategorySchedule(tx, {
    scope: actor.scope,
    categoryId: input.categoryId,
    row: await lockCategorySchedule(actor.scope, { tx, ...input }),
  });
  if (supported.row.version !== input.expectedScheduleVersion)
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The category schedule changed. Reload before trying again.',
    );
  if (supported.row.status !== 'PENDING')
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'Only pending category schedules can be changed.',
    );
  await lockReserved(tx, actor.scope, input.idempotencyKey);
  return { ...supported, event, category, now: (actor.clock ?? systemClock).now() };
}
