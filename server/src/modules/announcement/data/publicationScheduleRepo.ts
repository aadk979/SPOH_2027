import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function insertPublicationSchedule(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    draftId: string;
    version: number;
    authorId: string;
    runAt: Date;
    now: Date;
  },
) {
  return input.tx.scheduledAction.create({
    data: {
      eventId: scope.eventId,
      type: 'announcement.publish',
      payload: { draftId: input.draftId, expectedVersion: input.version },
      createdByPersonId: input.authorId,
      runAt: input.runAt,
      scheduledFor: input.runAt,
      createdAt: input.now,
    },
  });
}

export function findOwnPublicationSchedule(
  scope: EventScope,
  input: { id: string; draftId: string; authorId: string },
) {
  return prisma.scheduledAction.findFirst({
    where: {
      eventId: scope.eventId,
      id: input.id,
      type: 'announcement.publish',
      createdByPersonId: input.authorId,
      payload: { path: ['draftId'], equals: input.draftId },
    },
  });
}
