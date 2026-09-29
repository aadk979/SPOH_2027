import type { Event, Prisma } from '../../../generated/prisma/client.js';
import type { EventStatus } from '../../../generated/prisma/enums.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Data access for events and the taxonomy each one owns (ADR-001, ADR-002). */

export type { Event, EventStatus };

export interface EventTaxonomy {
  categories: ReadonlyArray<{ code: string; label: string }>;
  stationTypes: ReadonlyArray<{
    code: string;
    label: string;
    registersVisitors?: boolean;
    countsEntry?: boolean;
    issuesStamp?: boolean;
    redeemsGifts?: boolean;
  }>;
  shiftTemplates: ReadonlyArray<{
    code: string;
    label: string;
    startLocal: string;
    endLocal: string;
    endsNextDay?: boolean;
  }>;
}

export async function insertEvent(
  tx: PrismaTransactionClient,
  data: Prisma.EventUncheckedCreateInput,
): Promise<Event> {
  return tx.event.create({ data });
}

export async function insertTaxonomy(
  tx: PrismaTransactionClient,
  scope: EventScope,
  taxonomy: EventTaxonomy,
): Promise<void> {
  const { eventId } = scope;
  await tx.captureCategory.createMany({
    data: taxonomy.categories.map((category, index) => ({
      eventId,
      ...category,
      sortOrder: index + 1,
    })),
  });
  await tx.stationType.createMany({
    data: taxonomy.stationTypes.map((type, index) => ({ eventId, ...type, sortOrder: index + 1 })),
  });
  await tx.shiftTemplate.createMany({
    data: taxonomy.shiftTemplates.map((template, index) => ({
      eventId,
      ...template,
      sortOrder: index + 1,
    })),
  });
}

export async function findEvent(id: string, db: PrismaTransactionClient = prisma) {
  return db.event.findUnique({ where: { id } });
}
