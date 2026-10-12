import { prisma } from '../../../platform/db/client.js';
import { rehearsalFilter, type ReportingScope } from '../../../platform/db/rehearsalFilter.js';
import type { Window } from './repo.js';

/** Overall station counts keep imports while device facets use APP rows only. */
export async function stationSourceTotals(scope: ReportingScope, stationId: string, window: Window) {
  const where = { eventId: scope.eventId, stationId, voided: false, ...rehearsalFilter(scope),
    recordedAt: { gte: window.since, lte: window.until } };
  const registrations = await (prisma.registration.groupBy({ by: ['source'], where, _count: { _all: true } }));
  const footfall = await (prisma.footfallTick.groupBy({ by: ['source'], where, _sum: { quantity: true } }));
  const last = await (prisma.footfallTick.aggregate({ where, _max: { recordedAt: true } }));
  return { registrations: registrations.map((row) => ({ source: row.source, value: row._count._all })),
    footfall: footfall.map((row) => ({ source: row.source, value: row._sum.quantity ?? 0 })),
    lastFootfallAt: last._max.recordedAt };
}
