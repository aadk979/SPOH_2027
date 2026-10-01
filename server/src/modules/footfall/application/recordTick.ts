import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import type { CreateFootfallTickRequest, CreateFootfallTickResponse } from '@spoh/shared';
import { auditStationScopeBypass, writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { CaptureContext } from '../../../platform/http/captureActor.js';
import { eventTodayStart } from '../../../platform/event/today.js';
import { systemClock } from '../../../platform/time/index.js';
import { requireCountedStation } from '../../station/index.js';
import { toFootfallTickRecord } from '../data/mappers.js';
import { createTick, sumForRecorderSince, sumForStationSince } from '../data/repo.js';

/** One room entry from a counter's tap. */
export async function recordTick(
  request: CreateFootfallTickRequest,
  { actor, scope, audit, clock = systemClock }: CaptureContext,
): Promise<CreateFootfallTickResponse> {
  const station = await requireCountedStation(scope, request.stationId);
  // Server-stamped on receipt (BUILD_PLAN §3.3); the client's own timestamp is
  // kept alongside so a sleeping phone is visible rather than silently absent.
  const recordedAt = clock.now();

  const tick = await prisma.$transaction(async (tx) => {
    await captureProvenance(tx, scope, request);
    const row = await createTick(tx, scope, {
      stationId: station.id,
      recordedById: actor.volunteerId,
      recordedByMembershipId: actor.membershipId,
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

  const since = await eventTodayStart(scope, clock.now());
  const countsScope = { ...scope, rehearsal: tick.rehearsal };
  const [sessionTotal, stationTotal] = await Promise.all([
    sumForRecorderSince(
      countsScope,
      { recordedById: actor.volunteerId, stationId: station.id },
      since,
    ),
    sumForStationSince(countsScope, station.id, since),
  ]);

  return { tick: toFootfallTickRecord(tick), sessionTotal, stationTotal };
}
