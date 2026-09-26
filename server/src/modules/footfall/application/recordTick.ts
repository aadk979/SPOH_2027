import type { CreateFootfallTickRequest, CreateFootfallTickResponse } from '@spoh/shared';
import { auditStationScopeBypass, writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { CaptureContext } from '../../../platform/http/captureActor.js';
import { startOfEventDay, systemClock } from '../../../platform/time/index.js';
import { requireCountedStation } from '../../station/index.js';
import { toFootfallTickRecord } from '../data/mappers.js';
import { createTick, sumForRecorderSince, sumForStationSince } from '../data/repo.js';

/** One room entry from a counter's tap. */
export async function recordTick(
  request: CreateFootfallTickRequest,
  { actor, audit, clock = systemClock }: CaptureContext,
): Promise<CreateFootfallTickResponse> {
  const station = await requireCountedStation(request.stationId);
  // Server-stamped on receipt (BUILD_PLAN §3.3); the client's own timestamp is
  // kept alongside so a sleeping phone is visible rather than silently absent.
  const recordedAt = clock.now();

  const tick = await prisma.$transaction(async (tx) => {
    const row = await createTick(tx, {
      stationId: station.id,
      recordedById: actor.volunteerId,
      quantity: 1,
      source: 'APP',
      recordedAt,
      clientRecordedAt: request.clientRecordedAt ? new Date(request.clientRecordedAt) : null,
      idempotencyKey: request.idempotencyKey,
    });
    await auditStationScopeBypass(tx, actor.stationScopeBypass, audit);
    await writeAudit(tx, {
      ...audit,
      action: 'footfall.tick',
      entityType: 'FootfallTick',
      entityId: row.id,
      after: { stationId: row.stationId, quantity: row.quantity },
    });
    return row;
  });

  const since = startOfEventDay(clock.now());
  const [sessionTotal, stationTotal] = await Promise.all([
    sumForRecorderSince(actor.volunteerId, station.id, since),
    sumForStationSince(station.id, since),
  ]);

  return { tick: toFootfallTickRecord(tick), sessionTotal, stationTotal };
}
