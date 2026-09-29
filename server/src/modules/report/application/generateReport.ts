import type { FullReport, ReportQuery } from '@spoh/shared';
import { listStations } from '../../station/index.js';
import type { Range } from '../data/repo.js';
import { COUNTING_NOTE } from '../domain/countingNote.js';
import {
  cardsReport,
  footfallReport,
  giftsReport,
  integrityReport,
  registrationsReport,
  safetyReport,
  volunteersReport,
} from './sections.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Absent bounds mean the whole event. */
function resolveRange(query: ReportQuery): Range {
  return {
    from: query.from ? new Date(query.from) : new Date(0),
    to: query.to ? new Date(query.to) : new Date(8.64e15),
  };
}

/**
 * The post-event report: each section built by its own loader from its own
 * queries, composed here. Stations are named once for every section.
 */
export async function generateReport(scope: EventScope, query: ReportQuery): Promise<FullReport> {
  const range = resolveRange(query);
  const stations = await listStations(scope, { includeInactive: true });
  const names = new Map(stations.map((station) => [station.id, station.name]));
  const now = new Date();

  const [registrations, footfall, cards, gifts, safety, volunteers, dataIntegrity] =
    await Promise.all([
      registrationsReport(range),
      footfallReport(range, names),
      cardsReport(range, names),
      giftsReport(range, names),
      safetyReport(range),
      volunteersReport(range, names, now),
      integrityReport(scope, range),
    ]);

  return {
    generatedAt: now.toISOString(),
    range: { from: query.from ?? null, to: query.to ?? null },
    countingNote: COUNTING_NOTE,
    registrations,
    footfall,
    cards,
    gifts,
    safety,
    volunteers,
    dataIntegrity,
  };
}
