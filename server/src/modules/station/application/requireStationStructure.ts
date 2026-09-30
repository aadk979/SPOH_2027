import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findTagsByCodes, findTypeByCode } from '../data/repo.js';

/** The event's station type for a code; one the event lacks is a 404 (ADR-002). */
export async function requireStationType(
  tx: PrismaTransactionClient,
  scope: EventScope,
  code: string,
): Promise<string> {
  const type = await findTypeByCode(tx, scope, code);
  if (!type) throw new NotFoundError('Station type');
  return type.id;
}

/** The event's tags for these codes; any code the event lacks is a 404. */
export async function requireStationTags(
  tx: PrismaTransactionClient,
  scope: EventScope,
  codes: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(codes)];
  const tags = await findTagsByCodes(tx, scope, unique);
  if (tags.length !== unique.length) throw new NotFoundError('Station tag');
  return tags.map((tag) => tag.id);
}
