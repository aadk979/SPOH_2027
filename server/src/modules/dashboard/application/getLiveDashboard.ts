import type { LiveDashboardResponse } from '@spoh/shared';
import { runningShifts } from '../../../platform/event/runningShifts.js';
import { startOfEventDay } from '../../../platform/time/index.js';
import { getLiveFootfall } from '../../footfall/index.js';
import { listGifts } from '../../gift/index.js';
import { getFunnel } from '../../missionCard/index.js';
import { getLongShifts, getStaffingGaps } from '../../shift/index.js';
import {
  activeLostPersonCount,
  checkedInCount,
  findEventDayOn,
  onShiftCount,
  openIncidentCounts,
  registrationsByCategory,
  registrationsSince,
  anyShiftRunning,
  type Window,
} from '../data/repo.js';
import { getDataHealth } from './getDataHealth.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * The live operations dashboard (PRODUCT_BRIEF §9).
 *
 * One payload, polled every three seconds. No WebSockets: the payload is small,
 * there are under twenty dashboard clients, and polling is dramatically simpler
 * to operate and debug at 10am on 7 January (BUILD_PLAN §7.3).
 *
 * Every figure carries its unit. There is no combined total anywhere on this
 * screen, because there is no honest way to produce one. Each panel is built
 * by its own function, from its own queries, and composed here.
 */
export async function getLiveDashboard(
  scope: EventScope,
  now = new Date(),
): Promise<LiveDashboardResponse> {
  const since = startOfEventDay(now);
  const running = await runningShifts(scope, now);
  const [eventDay, withinEventHours] = await Promise.all([
    findEventDayOn(scope, since),
    anyShiftRunning(scope, running),
  ]);

  const [registrations, footfall, cards, gifts, safety, staffing, dataHealth] = await Promise.all([
    registrationsPanel(scope, { since, until: now }),
    footfallPanel(scope, now),
    cardsPanel(scope, { since, now }),
    listGifts(scope),
    safetyPanel(scope),
    staffingPanel(scope, { eventDayId: eventDay?.id ?? null, running }, now),
    getDataHealth(scope, now),
  ]);

  return {
    asOf: now.toISOString(),
    eventDayLabel: eventDay?.label ?? null,
    withinEventHours,
    registrations,
    footfall,
    cards,
    gifts,
    safety,
    staffing,
    dataHealth,
  };
}

type Panels = LiveDashboardResponse;

async function registrationsPanel(
  scope: EventScope,
  window: Window,
): Promise<Panels['registrations']> {
  const lastHourStart = new Date(window.until.getTime() - 60 * 60 * 1000);
  const [todayTotal, byCategory, lastHour] = await Promise.all([
    registrationsSince(scope, window),
    registrationsByCategory(scope, window),
    registrationsSince(scope, { since: lastHourStart, until: window.until }),
  ]);
  return { unit: 'registrations', todayTotal, byCategory, lastHour };
}

async function footfallPanel(scope: EventScope, now: Date): Promise<Panels['footfall']> {
  const footfall = await getLiveFootfall(scope, now);
  return {
    unit: 'roomEntries',
    todayTotal: footfall.stations.reduce((sum, station) => sum + station.todayTotal, 0),
    stations: footfall.stations,
  };
}

async function cardsPanel(
  scope: EventScope,
  { since, now }: { since: Date; now: Date },
): Promise<Panels['cards']> {
  const funnel = await getFunnel(scope, { from: since.toISOString(), to: now.toISOString() });
  return {
    unit: 'cards',
    issued: funnel.issued,
    completed: funnel.completed,
    redeemed: funnel.redeemed,
    stages: funnel.stages,
  };
}

async function safetyPanel(scope: EventScope): Promise<Panels['safety']> {
  const [incidents, lostPersons] = await Promise.all([
    openIncidentCounts(scope),
    activeLostPersonCount(scope),
  ]);
  return {
    openIncidents: incidents.open,
    criticalIncidents: incidents.critical,
    activeLostPersonAlerts: lostPersons,
  };
}

async function staffingPanel(
  scope: EventScope,
  {
    eventDayId,
    running,
  }: { eventDayId: string | null; running: Awaited<ReturnType<typeof runningShifts>> },
  now: Date,
): Promise<Panels['staffing']> {
  const [onShift, checkedIn, gaps, longShifts] = await Promise.all([
    onShiftCount(scope, running),
    eventDayId ? checkedInCount(scope, eventDayId) : 0,
    getStaffingGaps(scope, now),
    getLongShifts(scope, now),
  ]);
  return { onShift, checkedIn, gaps: gaps.gaps, longShifts };
}
