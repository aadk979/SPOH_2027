import type { FullReport, ReportQuery, ShiftBlock } from '@spoh/shared';
import { minutesBetween, shiftBlockEndsAt } from '../../platform/time/index.js';
import { prisma } from '../../platform/db/client.js';
import { listFallbackWindows } from '../fallback/service.js';
import { listGifts } from '../gift/service.js';
import { listStations } from '../station/repo.js';
import {
  cardTotals,
  cardsByDay,
  cardsPerStation,
  footfallBySource,
  footfallCurve,
  footfallTotals,
  giftRedemptionsByDay,
  giftRedemptionsByStation,
  importBatches,
  incidentsInRange,
  lostFoundCounts,
  lostPersonSummaries,
  recordsBySource,
  registrationTotals,
  registrationsByDay,
  registrationsByHour,
  unpurgedLostPersonCount,
  voidedCounts,
  volunteerAttendance,
  type Range,
} from './repo.js';

/**
 * The post-event report (PRODUCT_BRIEF §10).
 *
 * Generated, not assembled. Everything the deck asks each IC to consolidate —
 * slides 13, 28, 34, 43, 47 and 48 — comes out of one call.
 *
 * Two properties make it trustworthy:
 *
 *  - The three counts stay separate all the way to the export, each labelled
 *    with its unit, and the report opens with a note in prose explaining that
 *    they are not the same people counted three ways.
 *
 *  - The data-integrity section lists every fallback window, the split by
 *    source, and the voided rows. A reader can see exactly which hours are
 *    approximate without asking anybody.
 */

/**
 * The sentence at the top of every report.
 *
 * The single most likely misreading of this document is that registrations,
 * room entries and cards describe the same people. Saying so once, in words,
 * at the top, is cheaper than a footnote nobody reaches.
 */
const COUNTING_NOTE =
  'This report contains three separate counts, which measure different things and must not be added together. ' +
  'REGISTRATIONS counts people who signed up at the booth. ROOM ENTRIES counts bodies passing through a doorway, ' +
  'so one visitor who enters four rooms is four entries. CARDS counts Mission Card journeys, and one card may ' +
  'represent a whole family. There is no single "total visitors" figure, because there is no honest way to produce one.';

/** Absent bounds mean the whole event. */
function resolveRange(query: ReportQuery): Range {
  return {
    from: query.from ? new Date(query.from) : new Date(0),
    to: query.to ? new Date(query.to) : new Date(8.64e15),
  };
}

export async function generateReport(query: ReportQuery): Promise<FullReport> {
  const range = resolveRange(query);

  const [
    stations,
    registrations,
    regByDay,
    regByHour,
    footfallTotal,
    curve,
    bySource,
    cards,
    issuedByDay,
    completedByDay,
    perStation,
    gifts,
    giftsByDay,
    giftsByStation,
    incidents,
    lostPerson,
    unpurged,
    lostFound,
    attendance,
    windows,
    imports,
    sources,
    voided,
  ] = await Promise.all([
    listStations({ includeInactive: true }),
    registrationTotals(range),
    registrationsByDay(range),
    registrationsByHour(range),
    footfallTotals(range),
    footfallCurve(range),
    footfallBySource(range),
    cardTotals(range),
    cardsByDay(range, 'issuedAt'),
    cardsByDay(range, 'completedAt'),
    cardsPerStation(range),
    listGifts(),
    giftRedemptionsByDay(range),
    giftRedemptionsByStation(range),
    incidentsInRange(range),
    lostPersonSummaries(range),
    unpurgedLostPersonCount(range),
    lostFoundCounts(range),
    volunteerAttendance(range),
    listFallbackWindows({ from: range.from, to: range.to }),
    importBatches(range),
    recordsBySource(range),
    voidedCounts(range),
  ]);

  const stationName = new Map(stations.map((station) => [station.id, station.name]));

  return {
    generatedAt: new Date().toISOString(),
    range: {
      from: query.from ?? null,
      to: query.to ?? null,
    },
    countingNote: COUNTING_NOTE,

    registrations: {
      unit: 'registrations',
      total: registrations.total,
      byCategory: registrations.byCategory,
      byDay: regByDay,
      byHour: regByHour,
      voided: registrations.voided,
    },

    footfall: buildFootfallReport(footfallTotal, curve, bySource, stationName),

    cards: {
      unit: 'cards',
      issued: cards.issued,
      completed: cards.completed,
      voided: cards.voided,
      completionRate: cards.issued === 0 ? 0 : cards.completed / cards.issued,
      issuedByDay,
      completedByDay,
      byStation: perStation.map((row) => ({
        stationId: row.stationId,
        stationName: stationName.get(row.stationId) ?? 'Unknown',
        cards: row.cards,
      })),
    },

    gifts: {
      unit: 'redemptions',
      total: gifts.reduce((sum, gift) => sum + gift.redeemed, 0),
      byGiftType: gifts.map((gift) => ({
        giftTypeId: gift.id,
        giftTypeName: gift.name,
        redeemed: gift.redeemed,
        remaining: gift.remaining,
      })),
      byDay: giftsByDay,
      byStation: giftsByStation.map((row) => ({
        stationId: row.stationId,
        stationName: stationName.get(row.stationId) ?? 'Unknown',
        value: row.value,
      })),
    },

    safety: buildSafetyReport(incidents, lostPerson, unpurged, lostFound),

    volunteers: await buildVolunteerReport(attendance, stationName, new Date()),

    dataIntegrity: {
      containsFallbackData: windows.length > 0,
      fallbackWindows: windows,
      degradedMinutes: windows.reduce((sum, window) => sum + (window.durationMinutes ?? 0), 0),
      recordsBySource: sources,
      imports: imports.map((batch) => ({
        id: batch.id,
        source: batch.source,
        targetTable: batch.targetTable,
        rowCount: batch.rowCount,
        fileName: batch.fileName,
        importedAt: batch.importedAt.toISOString(),
        notes: batch.notes,
      })),
      voidedRecords: voided,
    },
  };
}

function buildFootfallReport(
  total: number,
  curve: Array<{ stationId: string; bucketStart: Date; value: number }>,
  bySource: Array<{ source: string; value: number }>,
  stationName: Map<string, string>,
): FullReport['footfall'] {
  const byStation = new Map<
    string,
    { total: number; peakBlockStart: Date | null; peakBlockValue: number }
  >();

  for (const point of curve) {
    const entry = byStation.get(point.stationId) ?? {
      total: 0,
      peakBlockStart: null,
      peakBlockValue: 0,
    };

    entry.total += point.value;

    // The busiest 30-minute block is the peak-period answer slide 28 asks for.
    if (point.value > entry.peakBlockValue) {
      entry.peakBlockValue = point.value;
      entry.peakBlockStart = point.bucketStart;
    }

    byStation.set(point.stationId, entry);
  }

  return {
    unit: 'roomEntries',
    total,
    byStation: [...byStation.entries()].map(([stationId, entry]) => ({
      stationId,
      stationName: stationName.get(stationId) ?? 'Unknown',
      total: entry.total,
      peakBlockStart: entry.peakBlockStart?.toISOString() ?? null,
      peakBlockValue: entry.peakBlockValue,
    })),
    curve: curve.map((point) => ({
      bucketStart: point.bucketStart.toISOString(),
      stationId: point.stationId,
      value: point.value,
    })),
    bySource,
  };
}

function buildSafetyReport(
  incidents: Awaited<ReturnType<typeof incidentsInRange>>,
  summaries: Awaited<ReturnType<typeof lostPersonSummaries>>,
  unpurged: Awaited<ReturnType<typeof unpurgedLostPersonCount>>,
  lostFound: Awaited<ReturnType<typeof lostFoundCounts>>,
): FullReport['safety'] {
  const byType = new Map<string, number>();
  for (const incident of incidents) {
    byType.set(incident.type, (byType.get(incident.type) ?? 0) + 1);
  }

  const minutes = summaries.map((summary) => summary.resolutionMinutes).sort((a, b) => a - b);
  const median =
    minutes.length === 0
      ? null
      : minutes.length % 2 === 1
        ? (minutes[(minutes.length - 1) / 2] as number)
        : ((minutes[minutes.length / 2 - 1] as number) + (minutes[minutes.length / 2] as number)) /
          2;

  const byOutcome = new Map<string, number>();
  for (const summary of summaries) {
    byOutcome.set(summary.outcome, (byOutcome.get(summary.outcome) ?? 0) + 1);
  }

  return {
    incidents: incidents.map((incident) => ({
      id: incident.id,
      type: incident.type,
      severity: incident.severity,
      status: incident.status,
      stationName: incident.station?.name ?? null,
      occurredAt: incident.occurredAt.toISOString(),
      reportedAt: incident.reportedAt.toISOString(),
      description: incident.description,
      followUpCount: incident._count.followUps,
    })),
    incidentsByType: [...byType.entries()]
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => b.value - a.value),
    nearMisses: byType.get('NEAR_MISS') ?? 0,

    lostPerson: {
      // Summaries plus alerts still inside the 24-hour retention window. A
      // report run the morning after would otherwise say "0 cases" purely
      // because the purge had not run yet.
      cases: summaries.length + unpurged.total,
      resolved: summaries.length + unpurged.resolved,
      medianResolutionMinutes: median,
      byOutcome: [...byOutcome.entries()].map(([outcome, value]) => ({
        outcome: outcome as FullReport['safety']['lostPerson']['byOutcome'][number]['outcome'],
        value,
      })),
    },

    lostAndFound: lostFound,
  };
}

/**
 * A shift nobody checked in to is a no-show only once its block is over
 * (F02-027). Until then it is not yet due: run after a dry run, the report
 * would otherwise count every January shift as missed.
 */
function hasEnded(assignment: { eventDay: { date: Date }; block: ShiftBlock }, now: Date): boolean {
  return shiftBlockEndsAt(assignment.eventDay.date, assignment.block) <= now;
}

async function buildVolunteerReport(
  attendance: Awaited<ReturnType<typeof volunteerAttendance>>,
  stationName: Map<string, string>,
  now: Date,
): Promise<FullReport['volunteers']> {
  const volunteersActive = await prisma.volunteer.count({ where: { active: true } });

  const byStation = new Map<string, { assignments: number; checkedIn: number; minutes: number }>();

  let checkedIn = 0;
  let totalMinutes = 0;

  for (const assignment of attendance) {
    const entry = byStation.get(assignment.stationId) ?? {
      assignments: 0,
      checkedIn: 0,
      minutes: 0,
    };

    entry.assignments += 1;

    if (assignment.checkedInAt) {
      entry.checkedIn += 1;
      checkedIn += 1;

      /**
       * Hours are measured check-in to check-out. Somebody who never checked
       * out contributes nothing rather than an open-ended number — an
       * unbounded "still on shift" would silently inflate the total, and the
       * honest answer is that we do not know when they left.
       */
      if (assignment.checkedOutAt) {
        const minutes = minutesBetween(assignment.checkedInAt, assignment.checkedOutAt);
        entry.minutes += minutes;
        totalMinutes += minutes;
      }
    }

    byStation.set(assignment.stationId, entry);
  }

  const assignments = attendance.length;
  const missed = attendance.filter((assignment) => !assignment.checkedInAt);
  const noShows = missed.filter((assignment) => hasEnded(assignment, now)).length;
  const notYetDue = missed.length - noShows;
  const due = assignments - notYetDue;

  return {
    volunteersActive,
    assignments,
    checkedIn,
    noShows,
    notYetDue,
    noShowRate: due === 0 ? 0 : noShows / due,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    byStation: [...byStation.entries()].map(([stationId, entry]) => ({
      stationId,
      stationName: stationName.get(stationId) ?? 'Unknown',
      assignments: entry.assignments,
      checkedIn: entry.checkedIn,
      hours: Math.round((entry.minutes / 60) * 10) / 10,
    })),
  };
}
