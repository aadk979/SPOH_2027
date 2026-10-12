import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { assignmentLinks } from './repo.js';

// Roster imports use the same lock key. Serialize creation as well as existing-row changes.
export async function lockAssignmentSlot(tx: PrismaTransactionClient, scope: EventScope, input: {
  volunteerId: string; shiftId: string;
}) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(
    ${`assignment:${scope.eventId}:${input.volunteerId}:${input.shiftId}`}, 0))`;
}

export async function assignmentTargets(tx: PrismaTransactionClient, scope: EventScope, input: {
  volunteerId: string; stationId: string; shiftId: string;
}) {
  await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE "eventId" = ${scope.eventId}
    AND "personId" = ${input.volunteerId} FOR SHARE`;
  const member = await (tx.eventMembership.findUnique({ where: { eventId_personId: { eventId: scope.eventId,
      personId: input.volunteerId } }, select: { status: true, person: { select: { deactivatedAt: true } } } }));
  const station = await (tx.station.findFirst({ where: { eventId: scope.eventId, id: input.stationId }, select: { active: true } }));
  const shift = await (tx.shift.findFirst({ where: { eventId: scope.eventId, id: input.shiftId }, select: { eventDayId: true } }));
  return { member, station, shift };
}

export async function upsertAssignmentChange(tx: PrismaTransactionClient, scope: EventScope, input: {
  volunteerId: string; stationId: string; eventDayId: string; shiftId: string; roleLabel: string;
}) {
  await lockAssignmentSlot(tx, scope, input);
  const previous = await tx.shiftAssignment.findUnique({ where: { eventId: scope.eventId,
    volunteerId_shiftId: { volunteerId: input.volunteerId, shiftId: input.shiftId } },
    select: { id: true, stationId: true, roleLabel: true, eventDayId: true } });
  if (previous && previous.stationId === input.stationId && previous.roleLabel === input.roleLabel
    && previous.eventDayId === input.eventDayId) return { id: previous.id, previous, changed: false };
  const links = await assignmentLinks(tx, scope, input.volunteerId);
  const row = await tx.shiftAssignment.upsert({ where: { eventId: scope.eventId,
    volunteerId_shiftId: { volunteerId: input.volunteerId, shiftId: input.shiftId } },
    create: { ...input, ...links }, update: { stationId: input.stationId, eventDayId: input.eventDayId,
      roleLabel: input.roleLabel, ...links }, select: { id: true } });
  return { id: row.id, previous, changed: true };
}

export async function assignmentForRemoval(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  const hint = await tx.shiftAssignment.findFirst({ where: { eventId: scope.eventId, id },
    select: { volunteerId: true, shiftId: true } });
  if (!hint) return null;
  await lockAssignmentSlot(tx, scope, hint);
  await tx.$queryRaw`SELECT id FROM "ShiftAssignment" WHERE "eventId" = ${scope.eventId} AND id = ${id} FOR UPDATE`;
  return tx.shiftAssignment.findFirst({ where: { eventId: scope.eventId, id },
    select: { id: true, volunteerId: true, stationId: true, eventDayId: true, shiftId: true, checkedInAt: true } });
}
