import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findCategory } from '../data/repo.js';

/**
 * The event's category for the code a capture names (ADR-002): a code the
 * event does not have is a category that does not exist, as for a station.
 */
export async function requireCategory(
  db: PrismaTransactionClient,
  scope: EventScope,
  code: string,
): Promise<{ id: string; code: string; label: string }> {
  const category = await findCategory(db, scope, code);
  if (!category) throw new NotFoundError('Category');
  return category;
}

/** The categories a group names, by code; any code the event lacks is a 404. */
export async function requireCategories(
  db: PrismaTransactionClient,
  scope: EventScope,
  codes: readonly string[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  // Sequential: parallel queries overlap on a transaction's connection (F03-019).
  for (const code of new Set(codes)) ids.set(code, (await requireCategory(db, scope, code)).id);
  return ids;
}
