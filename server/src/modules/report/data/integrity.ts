import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { Range } from './repo.js';

/**
 * Reads for the report's data-integrity section (PRODUCT_BRIEF §10, §11.4):
 * where the numbers came from, what was imported and what was voided, for one
 * event (ADR-001 §2).
 */

/** Rows of the event recorded in the range, voided or not. */
function recorded(scope: EventScope, range: Range, voided: boolean | null = false) {
  return {
    eventId: scope.eventId,
    ...(voided === null ? {} : { voided }),
    recordedAt: { gte: range.from, lt: range.to },
  };
}

export async function importBatches(scope: EventScope, range: Range) {
  return prisma.importBatch.findMany({
    where: { eventId: scope.eventId, importedAt: { gte: range.from, lt: range.to } },
    orderBy: { importedAt: 'asc' },
  });
}

/** How many rows in each capture table came from each source. */
export async function recordsBySource(scope: EventScope, range: Range) {
  const count = { _count: { _all: true } } as const;
  const [registrations, footfall, stamps, redemptions] = await Promise.all([
    prisma.registration.groupBy({ by: ['source'], where: recorded(scope, range), ...count }),
    prisma.footfallTick.groupBy({
      by: ['source'],
      where: recorded(scope, range),
      _sum: { quantity: true },
    }),
    prisma.cardStampEvent.groupBy({
      by: ['source'],
      where: recorded(scope, range, null),
      ...count,
    }),
    prisma.giftRedemption.groupBy({ by: ['source'], where: recorded(scope, range), ...count }),
  ]);

  return [
    ...registrations.map((row) => ({
      table: 'Registration',
      source: row.source,
      value: row._count._all,
    })),
    ...footfall.map((row) => ({
      table: 'FootfallTick',
      source: row.source,
      value: row._sum.quantity ?? 0,
    })),
    ...stamps.map((row) => ({
      table: 'CardStampEvent',
      source: row.source,
      value: row._count._all,
    })),
    ...redemptions.map((row) => ({
      table: 'GiftRedemption',
      source: row.source,
      value: row._count._all,
    })),
  ];
}

export async function voidedCounts(scope: EventScope, range: Range) {
  const [registrations, footfall, redemptions] = await Promise.all([
    prisma.registration.count({ where: recorded(scope, range, true) }),
    prisma.footfallTick.count({ where: recorded(scope, range, true) }),
    prisma.giftRedemption.count({ where: recorded(scope, range, true) }),
  ]);

  return [
    { table: 'Registration', value: registrations },
    { table: 'FootfallTick', value: footfall },
    { table: 'GiftRedemption', value: redemptions },
  ];
}
