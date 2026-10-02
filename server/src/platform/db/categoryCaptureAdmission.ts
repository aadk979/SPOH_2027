import { ERROR_CODES } from '@spoh/shared';
import { ConflictError, NotFoundError } from '../errors/index.js';
import type { PrismaTransactionClient } from './client.js';
import type { EventScope } from './eventScope.js';

/** Import commits recheck planned category ids under the shared capture Event lock. */
export async function assertActiveCategoryIds(
  scope: EventScope,
  input: { db: PrismaTransactionClient; ids: readonly string[] },
): Promise<void> {
  const ids = [...new Set(input.ids)];
  if (ids.length === 0) return;
  const rows = await input.db.captureCategory.findMany({
    where: { eventId: scope.eventId, id: { in: ids } },
    select: { id: true, active: true },
  });
  if (rows.length !== ids.length) throw new NotFoundError('Category');
  if (rows.some((row) => !row.active)) {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Capture is paused for a planned category.');
  }
}
