import type { StationDashboardResponse } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { getSettings } from '../../../platform/settings/index.js';
import { minutesBetween, startOfEventDay } from '../../../platform/time/index.js';
import { findStationById } from '../../station/index.js';
import {
  footfallByDevice,
  registrationsByDevice,
  stampsAtStation,
  stationRegistrationsByCategory,
  stationRoster,
} from '../data/repo.js';
import { deviceRate } from '../domain/signals.js';

/**
 * The same picture scoped to one station, for an IC.
 *
 * The per-device breakdown is the point: two volunteers working the same queue
 * can see the discrepancy between their totals, which is how double-counting
 * becomes visible before it becomes a reconciliation problem (§2.4).
 */
export async function getStationDashboard(
  stationId: string,
  now = new Date(),
): Promise<StationDashboardResponse> {
  const station = await findStationById(stationId);
  if (!station) throw new NotFoundError('Station');

  const since = startOfEventDay(now);
  const [registrations, footfall, stamps, roster] = await Promise.all([
    registrationsPanel(stationId, since, now),
    footfallPanel(stationId, since, now),
    stampsAtStation(stationId, since, now),
    rosterPanel(stationId, since),
  ]);

  return {
    asOf: now.toISOString(),
    stationId: station.id,
    stationName: station.name,
    registrations,
    footfall,
    stamps,
    roster,
  };
}

type Panels = StationDashboardResponse;

async function registrationsPanel(
  stationId: string,
  since: Date,
  now: Date,
): Promise<Panels['registrations']> {
  const implausibleRate = getSettings().implausibleTapsPerMinute;
  const [devices, categories] = await Promise.all([
    registrationsByDevice(stationId, since, now),
    stationRegistrationsByCategory(stationId, since, now),
  ]);
  return {
    unit: 'registrations',
    todayTotal: devices.reduce((sum, device) => sum + device.value, 0),
    byCategory: categories
      .map((row) => ({ key: row.category, value: row._count._all }))
      .sort((a, b) => b.value - a.value),
    byDevice: devices.map((device) => ({
      volunteerId: device.volunteerId,
      volunteerName: device.volunteerName,
      value: device.value,
      ...deviceRate(device.value, minutesBetween(device.firstAt, device.lastAt), implausibleRate),
    })),
  };
}

async function footfallPanel(
  stationId: string,
  since: Date,
  now: Date,
): Promise<Panels['footfall']> {
  const devices = await footfallByDevice(stationId, since, now);
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

async function rosterPanel(stationId: string, day: Date): Promise<Panels['roster']> {
  const roster = await stationRoster(stationId, day);
  return roster.map((assignment) => ({
    volunteerId: assignment.volunteerId,
    volunteerName: assignment.volunteer.displayName,
    roleLabel: assignment.roleLabel,
    checkedInAt: assignment.checkedInAt?.toISOString() ?? null,
    checkedOutAt: assignment.checkedOutAt?.toISOString() ?? null,
  }));
}
