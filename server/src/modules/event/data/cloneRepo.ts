import { randomUUID } from 'node:crypto';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Reads and writes for cloning an event's structure (ADR-001 §6). Every row
 * gets a fresh id; `IdMap` carries old → new ids so the rows that point at
 * each other (a station at its type, a shift at its day and template, a
 * membership at the one it reports to) point inside the new event.
 */
export type IdMap = Map<string, string>;

/** The event being created, and the old → new ids so far. */
export interface CloneTarget {
  eventId: string;
  ids: IdMap;
}

function fresh(ids: IdMap, oldId: string): string {
  const id = randomUUID();
  ids.set(oldId, id);
  return id;
}

/** A row as a copy in the new event: a fresh id, the event's id, no timestamps. */
function copyOf<
  T extends { id: string; eventId: string | null; createdAt?: Date; updatedAt?: Date },
>(row: T, ids: IdMap, eventId: string): Omit<T, 'createdAt' | 'updatedAt'> & { eventId: string } {
  const copy: Record<string, unknown> = { ...row, id: fresh(ids, row.id), eventId };
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy as Omit<T, 'createdAt' | 'updatedAt'> & { eventId: string };
}

function mapped(ids: IdMap, oldId: string | null): string | null {
  if (oldId === null) return null;
  const id = ids.get(oldId);
  if (!id) throw new Error(`clone: ${oldId} has no copy`);
  return id;
}

/** The source event's structure, read in the clone's transaction. */
export async function readStructure(tx: PrismaTransactionClient, source: EventScope) {
  const where = { eventId: source.eventId };
  return {
    categories: await tx.captureCategory.findMany({ where }),
    stationTypes: await tx.stationType.findMany({ where }),
    tags: await tx.stationTag.findMany({ where }),
    stations: await tx.station.findMany({ where }),
    taggings: await tx.stationTagging.findMany({ where }),
    templates: await tx.shiftTemplate.findMany({ where }),
    days: await tx.eventDay.findMany({ where, orderBy: { date: 'asc' } }),
    shifts: await tx.shift.findMany({ where }),
    giftTypes: await tx.giftType.findMany({ where }),
  };
}

export type Structure = Awaited<ReturnType<typeof readStructure>>;

/** Categories, station types, tags and shift templates: rows that point at nothing. */
export async function copyTaxonomy(
  tx: PrismaTransactionClient,
  target: CloneTarget,
  from: Pick<Structure, 'categories' | 'stationTypes' | 'tags' | 'templates'>,
): Promise<void> {
  const { eventId, ids } = target;
  await tx.captureCategory.createMany({
    data: from.categories.map((row) => copyOf(row, ids, eventId)),
  });
  await tx.stationType.createMany({
    data: from.stationTypes.map((row) => copyOf(row, ids, eventId)),
  });
  await tx.stationTag.createMany({
    data: from.tags.map((row) => copyOf(row, ids, eventId)),
  });
  await tx.shiftTemplate.createMany({
    data: from.templates.map((row) => copyOf(row, ids, eventId)),
  });
}

/** Stations on their copied types, with their tags. */
export async function copyStations(
  tx: PrismaTransactionClient,
  target: CloneTarget,
  from: Pick<Structure, 'stations' | 'taggings'>,
): Promise<void> {
  const { eventId, ids } = target;
  await tx.station.createMany({
    data: from.stations.map((row) => ({
      ...copyOf(row, ids, eventId),
      typeId: mapped(ids, row.typeId),
    })),
  });
  await tx.stationTagging.createMany({
    data: from.taggings.map((tagging) => ({
      eventId,
      stationId: mapped(ids, tagging.stationId) as string,
      tagId: mapped(ids, tagging.tagId) as string,
    })),
  });
}

/** Gift types with their stock reset: no redemptions or adjustments come along. */
export async function copyGiftTypes(
  tx: PrismaTransactionClient,
  target: EventScope,
  giftTypes: Structure['giftTypes'],
): Promise<void> {
  await tx.giftType.createMany({
    data: giftTypes.map(({ name, initialStock, lowStockThreshold, active }) => ({
      eventId: target.eventId,
      name,
      initialStock,
      lowStockThreshold,
      active,
    })),
  });
}

/** Days moved to their new dates, and their shifts moved with them. */
export async function copyDaysAndShifts(
  tx: PrismaTransactionClient,
  target: CloneTarget,
  from: {
    days: ReadonlyArray<Structure['days'][number] & { newDate: Date }>;
    shifts: ReadonlyArray<Structure['shifts'][number] & { newStartsAt: Date; newEndsAt: Date }>;
  },
): Promise<void> {
  const { eventId, ids } = target;
  await tx.eventDay.createMany({
    data: from.days.map(({ id, label, isPublicDay, isTourDay, newDate }) => ({
      id: fresh(ids, id),
      eventId,
      date: newDate,
      label,
      isPublicDay,
      isTourDay,
    })),
  });
  await tx.shift.createMany({
    data: from.shifts.map((shift) => ({
      eventId,
      eventDayId: mapped(ids, shift.eventDayId) as string,
      templateId: mapped(ids, shift.templateId) as string,
      startsAt: shift.newStartsAt,
      endsAt: shift.newEndsAt,
      overridden: shift.overridden,
    })),
  });
}

/** The source event's memberships, for "invite the same people". */
export async function readMemberships(tx: PrismaTransactionClient, source: EventScope) {
  return tx.eventMembership.findMany({
    where: { eventId: source.eventId, status: { in: ['ACTIVE', 'INVITED'] } },
    select: { id: true, personId: true, role: true, portfolio: true, reportsToId: true },
  });
}

/**
 * The same people, INVITED to the new event, with their roles, portfolios and
 * reporting lines; a line to someone not copied (deactivated) is dropped.
 */
export async function copyMemberships(
  tx: PrismaTransactionClient,
  target: EventScope,
  from: { memberships: Awaited<ReturnType<typeof readMemberships>>; invitedAt: Date },
): Promise<void> {
  const { memberships, invitedAt } = from;
  const ids: IdMap = new Map(memberships.map((row) => [row.id, randomUUID()]));
  await tx.eventMembership.createMany({
    data: memberships.map((row) => ({
      id: ids.get(row.id) as string,
      eventId: target.eventId,
      personId: row.personId,
      role: row.role,
      portfolio: row.portfolio,
      status: 'INVITED' as const,
      invitedAt,
    })),
  });
  for (const row of memberships) {
    const reportsToId = row.reportsToId ? (ids.get(row.reportsToId) ?? null) : null;
    if (!reportsToId) continue;
    await tx.eventMembership.update({
      where: { eventId_id: { eventId: target.eventId, id: ids.get(row.id) as string } },
      data: { reportsToId },
    });
  }
}

/** Is a slug taken in the organisation? */
export async function slugTaken(organisationId: string, slug: string): Promise<boolean> {
  return (await prisma.event.count({ where: { organisationId, slug } })) > 0;
}
