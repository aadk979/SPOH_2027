import { ERROR_CODES } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import {
  findCategoryActivity,
  lockCategoryEvent,
  updateCategoryActivity,
} from '../data/categoryActivity.js';

/** Provided transaction: activity, its audit and the worker's completion commit together. */
export async function setCategoryActive(
  tx: PrismaTransactionClient,
  input: { scope: EventScope; id: string; active: boolean; now: Date; audit: AuditContext },
): Promise<void> {
  const event = await lockCategoryEvent(input.scope, tx);
  if (!event) throw new NotFoundError('Event');
  if (event.status === 'ARCHIVED') {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Archived category settings are read-only.');
  }
  const category = await findCategoryActivity(input.scope, { tx, id: input.id });
  if (!category) throw new NotFoundError('Category');
  // The absolute desired state is idempotent; the worker still records its successful outcome.
  if (category.active === input.active) return;
  await updateCategoryActivity(input.scope, {
    tx,
    id: input.id,
    active: input.active,
    now: input.now,
  });
  await writeAudit(tx, {
    ...input.audit,
    action: 'category.setActive',
    entityType: 'CaptureCategory',
    entityId: input.id,
    before: { active: category.active },
    after: { active: input.active },
  });
}
