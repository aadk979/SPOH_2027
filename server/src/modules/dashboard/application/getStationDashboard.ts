import type { StationDashboardResponse } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { getSettings } from '../../../platform/settings/index.js';
import { eventToday, eventTodayStart } from '../../../platform/event/today.js';
import { minutesBetween } from '../../../platform/time/index.js';
import { findStationById } from '../../station/index.js';
import {
  footfallByDevice,
  registrationsByDevice,
  stampsAtStation,
  stationRegistrationsByCategory,
  stationRoster,
  type Window,
} from '../data/repo.js';
import { deviceRate } from '../domain/signals.js';
import { flaggedRedemptions } from '../data/flaggedRedemptions.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * The same picture scoped to one station, for an IC.
 *
 * The per-device breakdown is the point: two volunteers working the same queue
 * can see the discrepancy between their totals, which is how double-counting
 * becomes visible before it becomes a reconciliation problem (§2.4).
 */
export async function getStationDashboard(
  scope: EventScope,
  stationId: string,
  now = new Date(),
): Promise<StationDashboardResponse> {
  const station = await findStationById(scope, stationId);
  if (!station) throw new NotFoundError('Station');

  const since = await eventTodayStart(scope, now);
  const today = await eventToday(scope, now);
  const window = { since, until: now };
  const [registrations, footfall, stamps, roster, flagged] = await Promise.all([
    registrationsPanel(scope, stationId, window),
    footfallPanel(scope, stationId, window),
    stampsAtStation(scope, stationId, window),
    rosterPanel(scope, stationId, today),
    flaggedRedemptions(scope, { since, until: now, stationId }),
  ]);

  return {
    asOf: now.toISOString(),
    stationId: station.id,
    stationName: station.name,
    registrations,
    footfall,
    stamps,
    flaggedRedemptions: flagged,
    roster,
  };
}

type Panels = StationDashboardResponse;

async function registrationsPanel(
  scope: EventScope,
  stationId: string,
  window: Window,
): Promise<Panels['registrations']> {
  const implausibleRate = getSettings().implausibleTapsPerMinute;
  const [devices, byCategory] = await Promise.all([
    registrationsByDevice(scope, stationId, window),
    stationRegistrationsByCategory(scope, stationId, window),
  ]);
  return {
    unit: 'registrations',
    todayTotal: devices.reduce((sum, device) => sum + device.value, 0),
    byCategory,
    byDevice: devices.map((device) => ({
      volunteerId: device.volunteerId,
      volunteerName: device.volunteerName,
      value: device.value,
      ...deviceRate(device.value, minutesBetween(device.firstAt, device.lastAt), implausibleRate),
    })),
  };
}

async function footfallPanel(
  scope: EventScope,
  stationId: string,
  window: Window,
): Promise<Panels['footfall']> {
  const devices = await footfallByDevice(scope, stationId, window);
  return {
    unit: 'roomEntries',
    todayTotal: devices.reduce((sum, device) => sum + device.value, 0),
    lastActivityAt:
      devices
        .map((device) => device.lastAt)
        .sort((a, b) => b.getTime() - a.getTime())[0]
        ?.toISOString() ?? null,
    contributors: devices.map((device) => ({
      volunteerId: device.volunteerId,
      volunteerName: device.volunteerName,
      value: device.value,
      lastActivityAt: device.lastAt.toISOString(),
    })),
  };
}

async function rosterPanel(
  scope: EventScope,
  stationId: string,
  day: Date,
): Promise<Panels['roster']> {
  const roster = await stationRoster(scope, stationId, day);
  return roster.map((assignment) => ({
    assignmentId: assignment.id,
    block: assignment.block,
    volunteerId: assignment.volunteerId,
    volunteerName: assignment.volunteer.displayName,
    roleLabel: assignment.roleLabel,
    checkedInAt: assignment.checkedInAt?.toISOString() ?? null,
    checkedOutAt: assignment.checkedOutAt?.toISOString() ?? null,
  }));
}
