import type { Role } from '@spoh/access-policies';
import type { PrismaTransactionClient } from '../db/client.js';
import type { CaptureAdmissionRequest } from '../db/captureAdmission.js';
import { admitCountCapture } from '../db/countCaptureAdmission.js';
import { StationScopeError } from '../errors/index.js';
import { shiftFilter } from '../event/runningShifts.js';
import { databaseRoleGrants } from './authorizer/index.js';
import type { CaptureContext } from '../http/captureActor.js';

/**
 * Recheck station permission under the phase lock; middleware alone can race go-live. A role
 * the policies let capture at any station (`anyStation`, IC and above) may write off its
 * roster, and the write is audited as a station-scope bypass.
 */
export async function captureStation(
  tx: PrismaTransactionClient,
  context: Pick<CaptureContext, 'scope' | 'actor' | 'clock'>,
  request: CaptureAdmissionRequest & { stationId: string },
) {
  const { scope, actor } = context;
  const { shiftAt, ...provenance } = await admitCountCapture(tx, scope, {
    request,
    stationId: request.stationId,
    clock: context.clock,
  });
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
      shift: shiftFilter(scope, { ...provenance, now: shiftAt }),
    },
    select: { id: true },
  });
  if (!assignment && !(await anyStation(tx, scope.eventId, membership.role))) {
    throw new StationScopeError();
  }
  return {
    ...provenance,
    stationScopeBypass: assignment ? undefined : { stationId: request.stationId },
  };
}

async function anyStation(tx: PrismaTransactionClient, eventId: string, role: string) {
  const grants = await databaseRoleGrants.grantsFor(tx, eventId);
  return grants[role as Role].anyStation;
}
