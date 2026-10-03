import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { pageArgs, type PageRequest } from '../../../platform/db/pagination.js';

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
  tx: Pick<PrismaTransactionClient, 'scheduledAction'> = prisma,
) {
  return tx.scheduledAction.findFirst({
    where: {
      eventId: scope.eventId,
      id: input.id,
      type: 'announcement.publish',
      createdByPersonId: input.authorId,
      payload: { path: ['draftId'], equals: input.draftId },
    },
  });
}

export function listOwnPublicationSchedules(
  scope: EventScope,
  input: { draftId: string; authorId: string; page: PageRequest },
) {
  return prisma.scheduledAction.findMany({
    where: {
      eventId: scope.eventId,
      type: 'announcement.publish',
      createdByPersonId: input.authorId,
      payload: { path: ['draftId'], equals: input.draftId },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...pageArgs(input.page),
  });
}

export async function lockOwnPublicationSchedule(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string; draftId: string; authorId: string },
) {
  await input.tx
    .$queryRaw`SELECT id FROM "ScheduledAction" WHERE id = ${input.id} AND "eventId" = ${scope.eventId} FOR UPDATE`;
  return findOwnPublicationSchedule(scope, input, input.tx);
}

export function editPublicationSchedule(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    id: string;
    version: number;
    draftId: string;
    draftVersion: number;
    runAt: Date;
  },
) {
  return input.tx.scheduledAction.update({
    where: { eventId: scope.eventId, id: input.id, version: input.version, status: 'PENDING' },
    data: {
      payload: { draftId: input.draftId, expectedVersion: input.draftVersion },
      runAt: input.runAt,
      scheduledFor: input.runAt,
      version: { increment: 1 },
    },
  });
}

export function cancelPublicationSchedule(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string; version: number; now: Date },
) {
  return input.tx.scheduledAction.update({
    where: { eventId: scope.eventId, id: input.id, version: input.version, status: 'PENDING' },
    data: {
      status: 'CANCELLED',
      completedAt: input.now,
      lockedBy: null,
      lockedUntil: null,
      version: { increment: 1 },
    },
  });
}
