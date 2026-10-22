import { zonedDayWindow, type FullReport, type ReportQuery } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { EventZone } from '../../../platform/time/index.js';
import type { ReportReadScope } from '../data/readScope.js';
import type { ReportSpan } from './sections.js';

interface ResolvedReportRange {
  span: ReportSpan;
  range: FullReport['range'];
}

/** Omitted bounds keep the existing all-event metadata and query behavior. */
function wholeEventRange(query: ReportQuery, zone: EventZone): ResolvedReportRange {
  return {
    span: {
      from: query.from ? new Date(query.from) : new Date(0),
      to: query.to ? new Date(query.to) : new Date(8.64e15),
      zone,
    },
    range: { from: query.from ?? null, to: query.to ?? null },
  };
}

/** Resolve the selected calendar day through the report's own consistent transaction. */
export async function reportRange(
  scope: ReportReadScope,
  query: ReportQuery,
  zone: EventZone,
): Promise<ResolvedReportRange> {
  if (!query.eventDayId) return wholeEventRange(query, zone);
  const day = await scope.db.eventDay.findFirst({
    where: { eventId: scope.eventId, id: query.eventDayId },
    select: { date: true },
  });
  if (!day) throw new NotFoundError('Event day');
  const window = zonedDayWindow(
    day.date.toISOString().slice(0, 10),
    zone.timezone,
    zone.dayBoundaryMinutes,
  );
  const from = new Date(
    Math.max(window.start.getTime(), query.from ? Date.parse(query.from) : -Infinity),
  );
  const to = new Date(Math.min(window.end.getTime(), query.to ? Date.parse(query.to) : Infinity));
  return {
    span: { from, to, zone, eventDayId: query.eventDayId },
    range: { from: from.toISOString(), to: to.toISOString() },
  };
}
