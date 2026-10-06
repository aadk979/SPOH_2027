import { ERROR_CODES, type CategoryScheduleIntent } from '@spoh/shared';
import { ConflictError } from '../../../platform/errors/index.js';
import type { CategoryActivityRow } from '../data/categoryReadRepo.js';

/** A submission snapshot check, not a monotonic category revision or a due-time predicate. */
export function reviewCategorySchedule(input: {
  intent: CategoryScheduleIntent;
  category: CategoryActivityRow;
  now: Date;
}) {
  if (Date.parse(input.intent.runAt) <= input.now.getTime())
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Choose a future category change time.');
  if (
    input.intent.expectedActive !== input.category.active ||
    input.intent.expectedUpdatedAt !== input.category.updatedAt.toISOString()
  )
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'Category changed. Review its current activity before scheduling again.',
    );
}
