import type { DataHealthResponse, FootfallLiveResponse } from '@spoh/shared';
import { systemClock, minutesBetween } from '../../../platform/time/index.js';
import { prepareThresholds, type ThresholdSnapshot } from '../../../platform/settings/thresholds.js';
import { scheduledShifts } from '../../../platform/event/runningShifts.js';
import { eventToday, eventTodayStart } from '../../../platform/event/today.js';
import type { ReportingScope } from '../../../platform/db/rehearsalFilter.js';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { getLiveFootfall } from '../../footfall/index.js';
import { anyShiftRunning, checkedInWithLastCapture, findEventDayOn, openFallbackWindowExists } from '../data/repo.js';
import { staleDevices as staleDevicesOf } from '../domain/signals.js';
import { flaggedRedemptions } from '../data/flaggedRedemptions.js';
import { dashboardObservation } from './observation.js';
import { dashboardRosterAccess } from './rosterAccess.js';

type HealthOptions = { thresholds?: ThresholdSnapshot; reader?: ReadContext };
async function healthObservation(scope: ReportingScope, input: HealthOptions & { now: Date }) {
  const thresholds = input.thresholds ?? await prepareThresholds(scope);
  const since = await eventTodayStart(scope, input.now);
  const today = await eventToday(scope, input.now);
  const withinEventHours = await anyShiftRunning(scope, scheduledShifts(scope, input.now));
  const roster = await dashboardRosterAccess(scope, input.reader);
  return { thresholds, since, today, withinEventHours, roster };
}
type HealthObservation = Awaited<ReturnType<typeof healthObservation>>;

function silentStations(withinEventHours: boolean, stations: FootfallLiveResponse['stations']): DataHealthResponse['silentStations'] {
  if (!withinEventHours) return [];
  return stations.filter((station) => station.silent).map((station) => ({
    stationId: station.stationId, stationName: station.stationName, lastActivityAt: station.lastActivityAt,
    minutesSinceLastActivity: station.minutesSinceLastActivity,
  }));
}

async function healthSignals(scope: ReportingScope, input: HealthObservation & { now: Date }) {
  const [footfall, fallbackWindowOpen, eventDay, flagged] = await Promise.all([
    getLiveFootfall(scope, input.now, { thresholds: input.thresholds }),
    openFallbackWindowExists(scope, input.now), findEventDayOn(scope, input.today),
    input.roster.stationIds.length ? flaggedRedemptions(scope, { since: input.since, until: input.now, stationIds: input.roster.stationIds }) : [],
  ]);
  const staleDevices = input.withinEventHours && eventDay && input.roster.stationIds.length ? await staleDevicesFor(scope, {
    eventDayId: eventDay.id, since: input.since, now: input.now, staleAfterMinutes: input.thresholds.staleDeviceMinutes(),
    stationIds: input.roster.stationIds,
  }) : [];
  return { silentStations: silentStations(input.withinEventHours, footfall.stations), staleDevices,
    fallbackWindowOpen, flaggedRedemptions: flagged };
}

/** Aggregate warnings remain visible; named device and redemption facets need current roster authority. */
export async function getDataHealth(scope: ReportingScope, now = systemClock.now(),
  options: HealthOptions = {}): Promise<DataHealthResponse> {
  const observation = await healthObservation(scope, { ...options, now });
  const signals = await healthSignals(scope, { ...observation, now });
  return { rehearsalIncluded: scope.includeRehearsal ?? false, asOf: now.toISOString(),
    observation: dashboardObservation(scope, { ...observation, now }), rosterAvailability: observation.roster.availability,
    withinEventHours: observation.withinEventHours, ...signals };
}

async function staleDevicesFor(scope: ReportingScope,
  input: { eventDayId: string; since: Date; now: Date; staleAfterMinutes: number; stationIds: readonly string[] }): Promise<DataHealthResponse['staleDevices']> {
  const rows = await checkedInWithLastCapture(scope, { eventDayId: input.eventDayId, since: input.since,
    until: input.now, stationIds: input.stationIds });
  return staleDevicesOf(rows.map((row) => ({ volunteerId: row.volunteerId, volunteerName: row.volunteerName,
    stationName: row.stationName, assignmentId: row.assignmentId, stationId: row.stationId, shiftId: row.shiftId,
    eventDayId: row.eventDayId, lastCaptureAt: row.lastCaptureAt?.toISOString() ?? null,
    minutesSinceLastCapture: row.lastCaptureAt ? minutesBetween(row.lastCaptureAt, input.now) : null,
  })), input.staleAfterMinutes);
}
