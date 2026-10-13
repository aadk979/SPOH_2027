import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Every card writer locks the complete selection before reading status or journey. */
export async function lockCards(
  tx: PrismaTransactionClient,
  scope: EventScope,
  shortCodes: readonly string[],
): Promise<void> {
  const ordered = [...new Set(shortCodes)].sort();
  if (ordered.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "MissionCard" WHERE "eventId" = ${scope.eventId}
    AND "shortCode" IN (${Prisma.join(ordered)}) ORDER BY "shortCode" FOR UPDATE`;
}
