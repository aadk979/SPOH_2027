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
import { eventSlug, eventZone } from '../../../platform/event/events.js';
import { getEventSummary } from '../../event/index.js';
import { eventSetting } from '../../../platform/settings/eventSettings.js';
import type { EventZone } from '../../../platform/time/index.js';

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
export async function generateReport(scope: EventScope, query: ReportQuery): Promise<FullReport> {
  const zone = await eventZone(scope);
  const [summary, slug] = [await getEventSummary(scope), await eventSlug(scope)];
  const range = resolveRange(query, zone);
  const stations = await listStations(scope, { includeInactive: true });
  const names = new Map(stations.map((station) => [station.id, station.name]));
  const now = new Date();

  const [registrations, footfall, cards, gifts, safety, volunteers, dataIntegrity] =
    await Promise.all([
      registrationsReport(scope, range),
      footfallReport(scope, range, names),
      cardsReport(scope, range, names),
      giftsReport(scope, range, names),
      safetyReport(scope, range),
      volunteersReport(scope, range, { names, now }),
      integrityReport(scope, range),
    ]);

  const headline = headlineOf(await eventSetting(scope, 'product.countsMode'), {
    registrations: registrations.total,
    journeys: cards.issued,
    footfall: footfall.byStation.map(({ stationId, stationName, total }) => ({
      stationId,
      stationName,
      value: total,
    })),
  });

  return {
    generatedAt: now.toISOString(),
    range: { from: query.from ?? null, to: query.to ?? null },
    timezone: zone.timezone,
    event: { name: summary.name, slug, status: summary.status },
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
