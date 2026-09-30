import type { DeclareFallbackRequest, FallbackWindowRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { logger } from '../../../platform/logger/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { requireEventStation } from '../../station/index.js';
import { createWindow, findOpenWindow } from '../data/repo.js';
import { assertNoOpenWindow } from '../domain/windowRules.js';
import { windowRecord } from './windowRecord.js';

/** Declare degraded operation, event-wide or for one station. */
export async function declareFallback(
  request: DeclareFallbackRequest,
  { volunteerId: declaredById, scope, audit }: ActorContext,
  clock: Clock = systemClock,
): Promise<FallbackWindowRecord> {
  const stationId = await requireEventStation(scope, request.stationId);

  const window = await prisma.$transaction(async (tx) => {
    assertNoOpenWindow(await findOpenWindow(tx, scope, stationId), stationId);

    const row = await createWindow(tx, scope, {
      tier: request.tier,
      // Degraded operation usually started a few minutes before anybody
      // declared it, so the caller can backdate.
      startedAt: request.startedAt ? new Date(request.startedAt) : clock.now(),
      stationId,
      declaredById,
      reason: request.reason,
    });

    await writeAudit(tx, {
      ...audit,
      action: 'fallback.declare',
      entityType: 'FallbackWindow',
      entityId: row.id,
      after: { tier: row.tier, stationId, reason: row.reason },
    });

    return row;
  });

  logger.warn(
    { fallbackWindowId: window.id, tier: window.tier, stationId },
    'FALLBACK DECLARED — announce it in the Safety Communications Chat',
  );

  return windowRecord(scope, window);
}
