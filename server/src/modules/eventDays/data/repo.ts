import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

/** Data access for event days: the dates the event runs, and how many shifts each holds. */

const withAssignmentCount = {
  _count: { select: { shiftAssignments: true } },
} satisfies Prisma.EventDayInclude;

export type EventDayRow = Prisma.EventDayGetPayload<{ include: typeof withAssignmentCount }>;

export async function listEventDayRows(): Promise<EventDayRow[]> {
  return prisma.eventDay.findMany({ orderBy: { date: 'asc' }, include: withAssignmentCount });
}

export async function findEventDayByDate(date: Date) {
  return prisma.eventDay.findUnique({ where: { date } });
}

export async function findEventDayRow(id: string) {
  return prisma.eventDay.findUnique({ where: { id } });
}

export async function createEventDayRow(
  tx: PrismaTransactionClient,
  data: Prisma.EventDayCreateInput,
): Promise<EventDayRow> {
  return tx.eventDay.create({ data, include: withAssignmentCount });
}

export async function updateEventDayRow(
  tx: PrismaTransactionClient,
  change: { id: string; data: Prisma.EventDayUpdateInput },
): Promise<EventDayRow> {
  return tx.eventDay.update({
    where: { id: change.id },
    data: change.data,
    include: withAssignmentCount,
  });
}
