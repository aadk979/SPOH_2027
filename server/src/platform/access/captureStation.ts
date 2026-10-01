import { roleMeets } from '@spoh/shared';
import type { PrismaTransactionClient } from '../db/client.js';
import { captureProvenance } from '../db/captureProvenance.js';
import { StationScopeError } from '../errors/index.js';
import { shiftFilter } from '../event/runningShifts.js';
import type { CaptureContext } from '../http/captureActor.js';
import { systemClock } from '../time/index.js';

/** Recheck station permission under the phase lock; middleware alone can race go-live. */
export async function captureStation(
  tx: PrismaTransactionClient,
  context: Pick<CaptureContext, 'scope' | 'actor' | 'clock'>,
  request: { stationId: string; rehearsal?: boolean },
) {
  const { scope, actor } = context;
  const provenance = await captureProvenance(tx, scope, request);
  const membership = await tx.eventMembership.findFirst({
    where: { eventId: scope.eventId, id: actor.membershipId, personId: actor.volunteerId },
    select: { role: true, status: true },
  });
  if (membership?.status !== 'ACTIVE') throw new StationScopeError();
  const assignment = await tx.shiftAssignment.findFirst({
    where: {
      eventId: scope.eventId,
      membershipId: actor.membershipId,
      stationId: request.stationId,
      shift: shiftFilter(scope, { ...provenance, now: (context.clock ?? systemClock).now() }),
    },
    select: { id: true },
  });
  if (!assignment && !roleMeets(membership.role, 'IC')) throw new StationScopeError();
  return {
    ...provenance,
    stationScopeBypass: assignment ? undefined : { stationId: request.stationId },
  };
}
