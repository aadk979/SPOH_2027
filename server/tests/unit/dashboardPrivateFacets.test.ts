import { beforeEach, expect, it, vi } from 'vitest';
import type { ReadContext } from '../../src/platform/access/currentRead.js';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import { ServiceUnavailableError } from '../../src/platform/errors/index.js';
import { StationDashboardResponse } from '@spoh/shared';
const mocks = vi.hoisted(() => ({ findStationById: vi.fn(), registrationsByDevice: vi.fn(), footfallByDevice: vi.fn(),
  stationRegistrationsByCategory: vi.fn(), stationRoster: vi.fn(), stampsAtStation: vi.fn(), flaggedRedemptions: vi.fn(),
  stationSourceTotals: vi.fn() }));
vi.mock('../../src/modules/station/index.js', () => mocks);
vi.mock('../../src/modules/dashboard/data/repo.js', () => mocks);
vi.mock('../../src/modules/dashboard/data/flaggedRedemptions.js', () => mocks);
vi.mock('../../src/modules/dashboard/data/sourceTotals.js', () => mocks);
vi.mock('../../src/platform/settings/thresholds.js', () => ({ prepareThresholds: vi.fn(async () => ({ implausibleTapsPerMinute: () => 10 })) }));
vi.mock('../../src/platform/event/today.js', () => ({ eventToday: vi.fn(async () => new Date('2028-05-12T00:00:00Z')),
  eventTodayStart: vi.fn(async () => new Date('2028-05-12T00:00:00Z')) }));
import { getStationDashboard } from '../../src/modules/dashboard/application/getStationDashboard.js';
import { dashboardRosterAccess } from '../../src/modules/dashboard/application/rosterAccess.js';
const now = new Date('2028-05-12T10:00:00Z');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findStationById.mockResolvedValue({ id: 'station', name: 'Room' });
  mocks.stationRegistrationsByCategory.mockResolvedValue([]);
  mocks.stampsAtStation.mockResolvedValue(0);
  mocks.stationSourceTotals.mockResolvedValue({ registrations: [{ source: 'APP', value: 1 }, { source: 'PAPER', value: 3 }],
    footfall: [{ source: 'APP', value: 2 }, { source: 'FALLBACK_SHEET', value: 7 }], lastFootfallAt: now });
});
function context(): ReadContext {
  return { scope: { eventId: 'event' }, personId: 'person', membershipId: 'member', now,
    db: {} as PrismaTransactionClient, canRead: vi.fn(async () => false) };
}
it('defaults private facets to denied while retaining overall source totals and never querying named rows', async () => {
  const result = StationDashboardResponse.parse(await getStationDashboard({ eventId: 'event' }, 'station', now));
  expect(result.registrations.todayTotal).toBe(4);
  expect(result.footfall.todayTotal).toBe(9);
  expect(result.registrations.sourceBreakdown).toEqual([{ source: 'APP', value: 1 }, { source: 'PAPER', value: 3 }]);
  expect(result.rosterAvailability).toBe('denied');
  expect(result.deviceAvailability).toBe('denied');
  expect(result.roster).toEqual([]);
  expect(result.registrations.byDevice).toEqual([]);
  expect(result.footfall.contributors).toEqual([]);
  expect(result.flaggedRedemptions).toEqual([]);
  for (const name of ['registrationsByDevice', 'footfallByDevice', 'stationRoster', 'flaggedRedemptions'] as const) {
    expect(mocks[name]).not.toHaveBeenCalled();
  }
  expect(mocks.stationSourceTotals).toHaveBeenCalledTimes(1);
});
it('propagates a policy error before any count or private facet query', async () => {
  const reader = context();
  reader.canRead = vi.fn(async () => { throw new ServiceUnavailableError('Policy unavailable'); });
  await expect(getStationDashboard({ eventId: 'event' }, 'station', { now, reader })).rejects.toMatchObject({ statusCode: 503 });
  expect(mocks.stationSourceTotals).not.toHaveBeenCalled();
  expect(mocks.stationRoster).not.toHaveBeenCalled();
});
it('refuses a read context from another event before querying its private rows', async () => {
  await expect(getStationDashboard({ eventId: 'different' }, 'station', { now, reader: context() })).rejects.toMatchObject({ statusCode: 403 });
  expect(mocks.stationSourceTotals).not.toHaveBeenCalled();
});
it('defaults the event-wide private roster access to denied without a caller context', async () => {
  expect(await dashboardRosterAccess({ eventId: 'event' })).toEqual({ stationIds: [], availability: 'denied' });
});
