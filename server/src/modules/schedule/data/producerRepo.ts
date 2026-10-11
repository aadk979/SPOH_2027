import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { TIMELINE_METADATA } from './repo.js';

/** The user-created kinds this module produces and may cancel; other kinds own their own APIs. */
export const PRODUCED_TYPES = ['event.transition', 'report.snapshot'] as const;
export type ProducedType = (typeof PRODUCED_TYPES)[number];
export type ProducedPayload = Prisma.InputJsonValue;

export function insertUserSchedule(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: {
    type: ProducedType;
    payload: ProducedPayload;
    runAt: Date;
    personId: string;
    now: Date;
  },
) {
  return tx.scheduledAction.create({
    data: {
      eventId: scope.eventId,
      type: input.type,
      payload: input.payload,
      runAt: input.runAt,
      scheduledFor: input.runAt,
      createdByPersonId: input.personId,
      createdAt: input.now,
    },
    select: TIMELINE_METADATA,
  });
}

/** Locks the row, so a claim and a cancel cannot both win. */
export async function lockProducedSchedule(
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
) {
  await tx.$queryRaw`
    SELECT id FROM "ScheduledAction" WHERE id = ${id} AND "eventId" = ${scope.eventId} FOR UPDATE`;
  return tx.scheduledAction.findFirst({
    where: {
      eventId: scope.eventId,
      id,
      type: { in: [...PRODUCED_TYPES] },
      recurrence: null,
      dedupeKey: null,
      createdByPersonId: { not: null },
    },
    select: TIMELINE_METADATA,
  });
}

export function markScheduleCancelled(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { id: string; version: number; now: Date },
) {
  return tx.scheduledAction.update({
    where: { id: input.id, eventId: scope.eventId, version: input.version, status: 'PENDING' },
    data: {
      status: 'CANCELLED',
      completedAt: input.now,
      lockedBy: null,
      lockedUntil: null,
      version: { increment: 1 },
    },
    select: TIMELINE_METADATA,
  });
}
