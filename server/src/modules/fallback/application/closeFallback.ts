import type { CloseFallbackRequest, FallbackWindowRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { minutesBetween, systemClock } from '../../../platform/time/index.js';
import { endWindow, findWindow } from '../data/repo.js';
import { assertEndsAfterStart, assertWindowOpen } from '../domain/windowRules.js';
import { windowRecord } from './windowRecord.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

/** Close a window, now or at a backdated time no earlier than its start. */
export async function closeFallback(
  windowId: string,
  request: CloseFallbackRequest,
  { scope, audit }: ActorContext,
): Promise<FallbackWindowRecord> {
  const closed = await prisma.$transaction(async (tx) => {
    const existing = await findWindow(tx, windowId);
    if (!existing) throw new NotFoundError('Fallback window');
    assertWindowOpen(existing);

    const endedAt = request.endedAt ? new Date(request.endedAt) : systemClock.now();
    assertEndsAfterStart(existing, endedAt);

    const row = await endWindow(tx, windowId, endedAt);

    await writeAudit(tx, {
      ...audit,
      action: 'fallback.close',
      entityType: 'FallbackWindow',
      entityId: windowId,
      before: { endedAt: null },
      after: {
        endedAt: endedAt.toISOString(),
        durationMinutes: minutesBetween(existing.startedAt, endedAt),
        note: request.note ?? null,
      },
    });

    return row;
  });

  return windowRecord(scope, closed);
}
