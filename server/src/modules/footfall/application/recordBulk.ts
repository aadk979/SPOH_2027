import { captureStation } from '../../../platform/access/captureStation.js';
import type { CreateFootfallBulkRequest, CreateFootfallTickResponse } from '@spoh/shared';
import { auditStationScopeBypass, writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { CaptureContext } from '../../../platform/http/captureActor.js';
import { eventTodayStart } from '../../../platform/event/today.js';
import { systemClock } from '../../../platform/time/index.js';
import { requireCountedStation } from '../../station/index.js';
import { toFootfallTickRecord } from '../data/mappers.js';
import { createTick, sumForRecorderSince, sumForStationSince } from '../data/repo.js';

/**
 * IC bulk entry: a physical clicker total at end of shift, or a 30-minute block
 * transcribed off a fallback sheet. Always source-tagged, and `timeBlockStart`
 * records that only the block is known — so a report can state plainly that
 * this hour came from manual counts (PRODUCT_BRIEF §11.4).
 */
export async function recordBulk(
  request: CreateFootfallBulkRequest,
  { actor, scope, audit, clock = systemClock }: CaptureContext,
): Promise<CreateFootfallTickResponse> {
  const station = await requireCountedStation(scope, request.stationId);
  const timeBlockStart = new Date(request.timeBlockStart);

  const tick = await prisma.$transaction(async (tx) => {
    const { stationScopeBypass } = await captureStation(tx, { scope, actor, clock }, request);
    const row = await createTick(tx, scope, {
      stationId: station.id,
      recordedById: actor.volunteerId,
      recordedByMembershipId: actor.membershipId,
      quantity: request.quantity,
      source: request.source,
      timeBlockStart,
      // A block total belongs at the start of its block, not at the moment the
      // IC happened to type it in — otherwise the curve grows a spike at 18:00.
      recordedAt: timeBlockStart,
      idempotencyKey: request.idempotencyKey,
    });
    await auditStationScopeBypass(tx, stationScopeBypass, audit);
    await writeAudit(tx, {
      ...audit,
      action: 'footfall.bulk',
      entityType: 'FootfallTick',
      entityId: row.id,
      after: {
        stationId: row.stationId,
        quantity: row.quantity,
        source: row.source,
        timeBlockStart: timeBlockStart.toISOString(),
        reason: request.reason,
      },
    });
    return row;
  });

  const since = await eventTodayStart(scope, clock.now());
  const countsScope = { ...scope, rehearsal: tick.rehearsal };
  return {
    tick: toFootfallTickRecord(tick),
    sessionTotal: await sumForRecorderSince(
      countsScope,
      { recordedById: actor.volunteerId, stationId: station.id },
      since,
    ),
    stationTotal: await sumForStationSince(countsScope, station.id, since),
  };
}
