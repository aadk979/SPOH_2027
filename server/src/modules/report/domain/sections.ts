import type { FullReport, ShiftBlock } from '@spoh/shared';
import { minutesBetween, shiftBlockEndsAt } from '../../../platform/time/index.js';

/**
 * The report's computed sections: totals, peaks, medians and rates from the
 * rows the data layer returns. Pure, so each figure the committee reads can be
 * checked without a database.
 */

export interface IncidentRow {
  id: string;
  type: FullReport['safety']['incidents'][number]['type'];
  severity: FullReport['safety']['incidents'][number]['severity'];
  status: FullReport['safety']['incidents'][number]['status'];
  station: { name: string } | null;
  occurredAt: Date;
  reportedAt: Date;
  description: string;
  _count: { followUps: number };
}

export interface AttendanceRow {
  stationId: string;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  eventDay: { date: Date };
  block: ShiftBlock;
}

/** The middle value, or the mean of the middle two; null for no values. */
export function medianOf(values: readonly number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = sorted.length / 2;
  return sorted.length % 2 === 1
    ? (sorted[(sorted.length - 1) / 2] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export function footfallSection(
  rows: {
    total: number;
    curve: Array<{ stationId: string; bucketStart: Date; value: number }>;
    bySource: Array<{ source: string; value: number }>;
  },
  stationName: ReadonlyMap<string, string>,
): FullReport['footfall'] {
  const { total, curve, bySource } = rows;
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

export function safetySection(input: {
  incidents: readonly IncidentRow[];
  summaries: readonly { resolutionMinutes: number; outcome: string }[];
  unpurged: { total: number; resolved: number };
  lostFound: FullReport['safety']['lostAndFound'];
}): FullReport['safety'] {
  const { incidents, summaries, unpurged, lostFound } = input;
  const byType = new Map<string, number>();
  for (const incident of incidents) {
    byType.set(incident.type, (byType.get(incident.type) ?? 0) + 1);
  }

  const median = medianOf(summaries.map((summary) => summary.resolutionMinutes));

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

export function volunteersSection(
  attendance: readonly AttendanceRow[],
  context: { volunteersActive: number; stationName: ReadonlyMap<string, string>; now: Date },
): FullReport['volunteers'] {
  const { volunteersActive, stationName, now } = context;

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
