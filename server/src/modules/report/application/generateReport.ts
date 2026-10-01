import { headlineOf, type FullReport, type ReportQuery } from '@spoh/shared';
import { listStations } from '../../station/index.js';
import { COUNTING_NOTE } from '../domain/countingNote.js';
import {
  cardsReport,
  footfallReport,
  giftsReport,
  integrityReport,
  registrationsReport,
  safetyReport,
  volunteersReport,
  type ReportSpan,
} from './sections.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { findReportEvent } from '../data/readScope.js';
import { eventSetting } from '../../../platform/settings/eventSettings.js';
import type { EventZone } from '../../../platform/time/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';

/** Absent bounds mean the whole event. */
function resolveRange(query: ReportQuery, zone: EventZone): ReportSpan {
  return {
    from: query.from ? new Date(query.from) : new Date(0),
    to: query.to ? new Date(query.to) : new Date(8.64e15),
    zone,
  };
}

/**
 * The post-event report: each section built by its own loader from its own
 * queries, composed here. Stations are named once for every section.
 */
export async function generateReport(
  eventScope: EventScope,
  query: ReportQuery,
  clock: Clock = systemClock,
): Promise<FullReport> {
  return prisma.$transaction(
    (tx) => generateReportInTransaction(tx, eventScope, { query, clock }),
    { isolationLevel: 'RepeatableRead', timeout: 30_000 },
  );
}

/** Close-out supplies its transaction so its frozen report shares the mutation's fate. */
export async function generateReportInTransaction(
  tx: PrismaTransactionClient,
  eventScope: EventScope,
  { query, clock = systemClock }: { query: ReportQuery; clock?: Clock },
): Promise<FullReport> {
  const scope = { ...eventScope, includeRehearsal: query.includeRehearsal ?? false, db: tx };
  const summary = await findReportEvent(scope);
  const zone = { timezone: summary.timezone, dayBoundaryMinutes: summary.dayBoundaryMinutes };
  const range = resolveRange(query, zone);
  const stations = await listStations(scope, { includeInactive: true }, tx);
  const names = new Map(stations.map((station) => [station.id, station.name]));
  const now = clock.now();

  const registrations = await registrationsReport(scope, range);
  const footfall = await footfallReport(scope, range, names);
  const cards = await cardsReport(scope, range, names);
  const gifts = await giftsReport(scope, range, names);
  const safety = await safetyReport(scope, range);
  const volunteers = await volunteersReport(scope, range, { names, now });
  const dataIntegrity = await integrityReport(scope, range);

  const headline = headlineOf(await eventSetting(scope, 'product.countsMode', tx), {
    registrations: registrations.total,
    journeys: cards.issued,
    footfall: footfall.byStation.map(({ stationId, stationName, total }) => ({
      stationId,
      stationName,
      value: total,
    })),
  });

  return {
    rehearsalIncluded: scope.includeRehearsal,
    generatedAt: now.toISOString(),
    range: { from: query.from ?? null, to: query.to ?? null },
    timezone: zone.timezone,
    event: { name: summary.name, slug: summary.slug, status: summary.status },
    countingNote: COUNTING_NOTE,
    headline,
    registrations,
    footfall,
    cards,
    gifts,
    safety,
    volunteers,
    dataIntegrity,
  };
}
