import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findCategoryActivity } from '../data/categoryReadRepo.js';

export async function requireCategoryActivity(
  tx: PrismaTransactionClient,
  input: { scope: EventScope; categoryId: string },
) {
  const category = await findCategoryActivity(input.scope, { tx, id: input.categoryId });
  if (!category) throw new NotFoundError('Category');
  return category;
}
