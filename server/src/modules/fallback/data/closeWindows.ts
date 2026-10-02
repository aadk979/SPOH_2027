import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** A future declaration closes at its start: a zero-length window, never a negative duration. */
export async function endOpenWindows(
  tx: PrismaTransactionClient,
  scope: EventScope,
  now: Date,
): Promise<string[]> {
  const windows = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "FallbackWindow" SET "endedAt" = GREATEST("startedAt", ${now})
    WHERE "eventId" = ${scope.eventId} AND "endedAt" IS NULL RETURNING id`;
  return windows.map((window) => window.id);
}
