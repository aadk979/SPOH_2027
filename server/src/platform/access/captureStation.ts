import type { Role } from '@spoh/access-policies';
import type { PrismaTransactionClient } from '../db/client.js';
import type { CaptureAdmissionRequest } from '../db/captureAdmission.js';
import { admitCountCapture } from '../db/countCaptureAdmission.js';
import { StationScopeError } from '../errors/index.js';
import { shiftFilter } from '../event/runningShifts.js';
import { databaseRoleGrants } from './authorizer/index.js';
import type { CaptureContext } from '../http/captureActor.js';
import { lockCurrentActor, requireCurrentPermission } from './currentPermission.js';

export type StationCaptureAction = 'Registration.Create' | 'Footfall.Create' | 'Card.Stamp' | 'Gift.Redeem';

/**
 * Recheck station permission under the phase lock; middleware alone can race go-live. A role
 * the policies let capture at any station (`anyStation`, IC and above) may write off its
 * roster, and the write is audited as a station-scope bypass.
 */
export async function captureStation(
  tx: PrismaTransactionClient,
  context: Pick<CaptureContext, 'scope' | 'actor' | 'clock'> & { action: StationCaptureAction },
  request: CaptureAdmissionRequest & { stationId: string },
) {
  const { scope, actor } = context;
  const { shiftAt, ...provenance } = await admitCountCapture(tx, scope, {
    request,
    stationId: request.stationId,
    clock: context.clock,
  });
  await lockCurrentActor(tx, { scope, membershipId: actor.membershipId, personId: actor.volunteerId });
  await tx.$queryRaw`SELECT id FROM "ShiftAssignment" WHERE "eventId" = ${scope.eventId}
    AND "membershipId" = ${actor.membershipId} ORDER BY id FOR SHARE`;
  await tx.$queryRaw`SELECT s.id FROM "Shift" s WHERE s."eventId" = ${scope.eventId}
    AND EXISTS (SELECT 1 FROM "ShiftAssignment" a WHERE a."eventId" = s."eventId"
      AND a."shiftId" = s.id AND a."membershipId" = ${actor.membershipId}) ORDER BY s.id FOR SHARE`;
  await requireCurrentPermission(tx, { scope, membershipId: actor.membershipId,
    personId: actor.volunteerId, action: context.action, resource: { type: 'Station', id: request.stationId },
    clock: context.clock, shiftAt, facts: { lateSyncAllowed: provenance.lateSync !== undefined } });
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
