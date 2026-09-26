import type {
  DataHealthResponse,
  LiveDashboardResponse,
  StationDashboardResponse,
} from '@spoh/shared';
import { NotFoundError } from '../../platform/errors/index.js';
import { prisma } from '../../platform/db/client.js';
import {
  activeShiftBlocks,
  eventDayAnchor,
  minutesBetween,
  singaporeDateString,
} from '../../platform/time/index.js';
import { getLiveFootfall, SILENT_STATION_MINUTES } from '../footfall/service.js';
import { listGifts } from '../gift/service.js';
import { getFunnel } from '../missionCard/service.js';
import { findStationById } from '../station/repo.js';
import { getLongShifts, getStaffingGaps } from '../shift/service.js';
import { DEFAULT_SETTINGS, getSettings } from '../../platform/settings/index.js';
import {
  activeLostPersonCount,
  checkedInCount,
  checkedInWithLastCapture,
  footfallByDevice,
  onShiftCount,
  openFallbackWindowExists,
  openIncidentCounts,
  registrationsByCategory,
  registrationsByDevice,
  registrationsSince,
  stampsAtStation,
} from './repo.js';

/**
 * The live operations dashboard (PRODUCT_BRIEF §9).
 *
 * One payload, polled every three seconds. No WebSockets: the payload is small,
 * there are under twenty dashboard clients, and polling is dramatically simpler
 * to operate and debug at 10am on 7 January (BUILD_PLAN §7.3).
 *
 * Every figure carries its unit. There is no combined total anywhere on this
 * screen, because there is no honest way to produce one.
 */

/** Shipped default; the live value is a runtime setting. */
const STALE_DEVICE_MINUTES = DEFAULT_SETTINGS.staleDeviceMinutes;

function startOfEventDay(now: Date): Date {
  return eventDayAnchor(singaporeDateString(now));
}

export async function getLiveDashboard(now = new Date()): Promise<LiveDashboardResponse> {
  const since = startOfEventDay(now);
  const blocks = activeShiftBlocks(now);
  const withinEventHours = blocks.length > 0;

  const eventDay = await prisma.eventDay.findUnique({
    where: { date: since },
    select: { id: true, label: true },
  });

  const [
    todayRegistrations,
    byCategory,
    lastHour,
    footfall,
    funnel,
    gifts,
    incidents,
    lostPersons,
    gaps,
    longShifts,
    dataHealth,
  ] = await Promise.all([
    registrationsSince(since, now),
    registrationsByCategory(since, now),
    registrationsSince(new Date(now.getTime() - 60 * 60 * 1000), now),
    getLiveFootfall(now),
    getFunnel({ from: since.toISOString(), to: now.toISOString() }),
    listGifts(),
    openIncidentCounts(),
    activeLostPersonCount(),
    getStaffingGaps(now),
    getLongShifts(now),
    getDataHealth(now),
  ]);

  const [onShift, checkedIn] = eventDay
    ? await Promise.all([onShiftCount(eventDay.id, blocks), checkedInCount(eventDay.id)])
    : [0, 0];

  return {
    asOf: now.toISOString(),
    eventDayLabel: eventDay?.label ?? null,
    withinEventHours,

    registrations: {
      unit: 'registrations',
      todayTotal: todayRegistrations,
      byCategory,
      lastHour,
    },

    footfall: {
      unit: 'roomEntries',
      todayTotal: footfall.stations.reduce((sum, station) => sum + station.todayTotal, 0),
      stations: footfall.stations,
    },

    cards: {
      unit: 'cards',
      issued: funnel.issued,
      completed: funnel.completed,
      redeemed: funnel.redeemed,
      stages: funnel.stages,
    },

    gifts,

    safety: {
      openIncidents: incidents.open,
      criticalIncidents: incidents.critical,
      activeLostPersonAlerts: lostPersons,
    },

    staffing: { onShift, checkedIn, gaps: gaps.gaps, longShifts },

    dataHealth,
  };
}

/**
 * Data health (PRODUCT_BRIEF §9) — the early warning that a station has quietly
 * stopped recording.
 *
 * This matters more than any server metric. The API can be perfectly healthy
 * while a room counts nothing for an hour, and a total alone would never reveal
 * it. Outside event hours silence is expected, so nothing is flagged.
 */
export async function getDataHealth(now = new Date()): Promise<DataHealthResponse> {
  const since = startOfEventDay(now);
  const blocks = activeShiftBlocks(now);
  const withinEventHours = blocks.length > 0;

  const [footfall, fallbackWindowOpen, eventDay] = await Promise.all([
    getLiveFootfall(now),
    openFallbackWindowExists(now),
    prisma.eventDay.findUnique({ where: { date: since }, select: { id: true } }),
  ]);

  const silentStations = withinEventHours
    ? footfall.stations
        .filter((station) => station.silent)
        .map((station) => ({
          stationId: station.stationId,
          stationName: station.stationName,
          lastActivityAt: station.lastActivityAt,
          minutesSinceLastActivity: station.minutesSinceLastActivity,
        }))
    : [];

  const staleAfter = getSettings().staleDeviceMinutes;

  const staleDevices =
    withinEventHours && eventDay
      ? (await checkedInWithLastCapture({ eventDayId: eventDay.id, blocks, since, until: now }))
          .map((row) => ({
            volunteerId: row.volunteerId,
            volunteerName: row.volunteerName,
            stationName: row.stationName,
            lastCaptureAt: row.lastCaptureAt?.toISOString() ?? null,
            minutesSinceLastCapture: row.lastCaptureAt
              ? minutesBetween(row.lastCaptureAt, now)
              : null,
          }))
          .filter(
            (row) =>
              row.minutesSinceLastCapture === null || row.minutesSinceLastCapture >= staleAfter,
          )
      : [];

  return {
    asOf: now.toISOString(),
    silentStations,
    staleDevices,
    fallbackWindowOpen,
    withinEventHours,
  };
}

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

  const implausibleRate = getSettings().implausibleTapsPerMinute;
  const since = startOfEventDay(now);
  const today = eventDayAnchor(singaporeDateString(now));

  const [registrationDevices, footfallDevices, stamps, roster, categories] = await Promise.all([
    registrationsByDevice(stationId, since, now),
    footfallByDevice(stationId, since, now),
    stampsAtStation(stationId, since, now),
    prisma.shiftAssignment.findMany({
      where: { stationId, eventDay: { date: today } },
      select: {
        volunteerId: true,
        roleLabel: true,
        checkedInAt: true,
        checkedOutAt: true,
        volunteer: { select: { displayName: true } },
      },
      orderBy: { roleLabel: 'asc' },
    }),
    prisma.registration.groupBy({
      by: ['category'],
      where: { stationId, voided: false, recordedAt: { gte: since, lte: now } },
      _count: { _all: true },
    }),
  ]);

  return {
    asOf: now.toISOString(),
    stationId: station.id,
    stationName: station.name,

    registrations: {
      unit: 'registrations',
      todayTotal: registrationDevices.reduce((sum, device) => sum + device.value, 0),
      byCategory: categories
        .map((row) => ({ key: row.category, value: row._count._all }))
        .sort((a, b) => b.value - a.value),
      byDevice: registrationDevices.map((device) => {
        // Rate over the window this device was actually active, not over the
        // whole day: someone who arrived at noon should not look slow.
        const activeMinutes = Math.max(1, minutesBetween(device.firstAt, device.lastAt));
        const perMinute = device.value / activeMinutes;

        return {
          volunteerId: device.volunteerId,
          volunteerName: device.volunteerName,
          value: device.value,
          perMinute: Math.round(perMinute * 10) / 10,
          // An implausible rate usually means someone is tapping to catch up
          // rather than counting as visitors arrive (§2.4).
          rateAnomaly: perMinute > implausibleRate,
        };
      }),
    },

    footfall: {
      unit: 'roomEntries',
      todayTotal: footfallDevices.reduce((sum, device) => sum + device.value, 0),
      lastActivityAt:
        footfallDevices
          .map((device) => device.lastAt)
          .sort((a, b) => b.getTime() - a.getTime())[0]
          ?.toISOString() ?? null,
      contributors: footfallDevices.map((device) => ({
        volunteerId: device.volunteerId,
        volunteerName: device.volunteerName,
        value: device.value,
        lastActivityAt: device.lastAt.toISOString(),
      })),
    },

    stamps,

    roster: roster.map((assignment) => ({
      volunteerId: assignment.volunteerId,
      volunteerName: assignment.volunteer.displayName,
      roleLabel: assignment.roleLabel,
      checkedInAt: assignment.checkedInAt?.toISOString() ?? null,
      checkedOutAt: assignment.checkedOutAt?.toISOString() ?? null,
    })),
  };
}

export { SILENT_STATION_MINUTES, STALE_DEVICE_MINUTES };
