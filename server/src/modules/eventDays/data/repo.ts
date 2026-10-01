import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { SHIFT_REF_SELECT } from '../../../platform/db/shiftRef.js';

/**
 * Data access for event days: the dates the event runs, how many shifts each
 * holds, and the shift rows each day gets from the event's templates.
 */

const withAssignmentCount = {
  _count: { select: { shiftAssignments: true } },
  shifts: { select: SHIFT_REF_SELECT, orderBy: { startsAt: 'asc' } },
} satisfies Prisma.EventDayInclude;

export type EventDayRow = Prisma.EventDayGetPayload<{ include: typeof withAssignmentCount }>;

export async function listEventDayRows(scope: EventScope): Promise<EventDayRow[]> {
  return prisma.eventDay.findMany({
    where: { eventId: scope.eventId },
    orderBy: { date: 'asc' },
    include: withAssignmentCount,
  });
}

export async function findEventDayByDate(scope: EventScope, date: Date) {
  return prisma.eventDay.findFirst({ where: { eventId: scope.eventId, date } });
}

export async function findEventDayRow(scope: EventScope, id: string) {
  return prisma.eventDay.findFirst({ where: { eventId: scope.eventId, id } });
}

/** A day as the API returns it: with its assignment count and shifts. */
export async function findEventDayRecordRow(scope: EventScope, id: string) {
  return prisma.eventDay.findFirst({
    where: { eventId: scope.eventId, id },
    include: withAssignmentCount,
  });
}

export async function createEventDayRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.EventDayUncheckedCreateInput, 'eventId'>,
): Promise<EventDayRow> {
  return tx.eventDay.create({
    data: { ...data, eventId: scope.eventId },
    include: withAssignmentCount,
  });
}

export async function updateEventDayRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: { id: string; data: Prisma.EventDayUncheckedUpdateInput },
): Promise<EventDayRow> {
  return tx.eventDay.update({
    where: { id: change.id, eventId: scope.eventId },
    data: change.data,
    include: withAssignmentCount,
  });
}

/** The event's timezone and shift templates: what a new day's shifts are made from. */
export async function findShiftPlan(tx: PrismaTransactionClient, scope: EventScope) {
  const [event, templates] = await Promise.all([
    tx.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: { timezone: true } }),
    tx.shiftTemplate.findMany({
      where: { eventId: scope.eventId, active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, startLocal: true, endLocal: true, endsNextDay: true },
    }),
  ]);
  return { timezone: event.timezone, templates };
}

export async function insertShifts(
  tx: PrismaTransactionClient,
  scope: EventScope,
  shifts: ReadonlyArray<{ eventDayId: string; templateId: string; startsAt: Date; endsAt: Date }>,
): Promise<void> {
  if (shifts.length === 0) return;
  await tx.shift.createMany({
    data: shifts.map((shift) => ({ ...shift, eventId: scope.eventId })),
    skipDuplicates: true,
  });
}

const TEMPLATE_FIELDS = {
  id: true,
  code: true,
  label: true,
  startLocal: true,
  endLocal: true,
  endsNextDay: true,
  sortOrder: true,
} satisfies Prisma.ShiftTemplateSelect;

export type TemplateRow = Prisma.ShiftTemplateGetPayload<{ select: typeof TEMPLATE_FIELDS }>;

/** The event's active shift templates, in the order the event runs them. */
export async function listTemplateRows(scope: EventScope): Promise<TemplateRow[]> {
  return prisma.shiftTemplate.findMany({
    where: { eventId: scope.eventId, active: true },
    orderBy: { sortOrder: 'asc' },
    select: TEMPLATE_FIELDS,
  });
}

export async function findTemplateRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
): Promise<TemplateRow | null> {
  return tx.shiftTemplate.findFirst({
    where: { eventId: scope.eventId, id },
    select: TEMPLATE_FIELDS,
  });
}

export async function updateTemplateRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: { id: string; data: { label?: string; startLocal?: string; endLocal?: string } },
): Promise<TemplateRow> {
  return tx.shiftTemplate.update({
    where: { id: change.id, eventId: scope.eventId },
    data: change.data,
    select: TEMPLATE_FIELDS,
  });
}

/** A template's shifts that still follow it: not overridden in the exceptions grid. */
export async function listFollowingShifts(
  tx: PrismaTransactionClient,
  scope: EventScope,
  templateId: string,
) {
  return tx.shift.findMany({
    where: { eventId: scope.eventId, templateId, overridden: false },
    select: { id: true, eventDay: { select: { date: true } } },
  });
}

export async function setShiftWindow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  shift: { id: string; startsAt: Date; endsAt: Date },
): Promise<void> {
  await tx.shift.update({
    where: { id: shift.id, eventId: scope.eventId },
    data: { startsAt: shift.startsAt, endsAt: shift.endsAt },
  });
}
