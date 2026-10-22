import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  range: { start: new Date('2026-01-05T22:00:00Z'), end: new Date('2026-01-06T22:00:00Z') },
  footfall: vi.fn().mockResolvedValue(0),
  registrations: vi.fn().mockResolvedValue(0),
  gifts: vi.fn().mockResolvedValue([]),
  fallback: vi.fn().mockResolvedValue(false),
}));
vi.mock('../../src/modules/footfall/data/repo.js', () => ({
  sumMatching: mocks.footfall,
  sumByBucket: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/modules/registration/data/repo.js', () => ({
  countMatching: mocks.registrations,
  groupByCategory: vi.fn().mockResolvedValue([]),
  groupByTimeBucket: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/modules/gift/data/repo.js', () => ({ summariseRedemptions: mocks.gifts }));
vi.mock('../../src/modules/gift/application/listGifts.js', () => ({
  listGifts: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/modules/fallback/index.js', () => ({
  rangeOverlapsFallbackWindow: mocks.fallback,
}));
vi.mock('../../src/modules/station/index.js', () => ({
  listCountedStations: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/platform/event/events.js', () => ({
  eventTimezone: vi.fn().mockResolvedValue('Asia/Singapore'),
  eventZone: vi.fn().mockResolvedValue({ timezone: 'Asia/Singapore', dayBoundaryMinutes: 360 }),
  eventDayWindow: vi.fn().mockImplementation(async () => mocks.range),
}));
vi.mock('../../src/platform/db/client.js', () => ({ prisma: {} }));
vi.mock('../../src/platform/db/captureProvenance.js', () => ({
  captureProvenance: vi.fn().mockResolvedValue({ rehearsal: false }),
}));
vi.mock('../../src/platform/time/index.js', () => ({
  BUCKET_MINUTES: { '15m': 15, '30m': 30, '1h': 60 },
  systemClock: { now: () => new Date('2027-01-07T03:30:00Z') },
}));
import { summariseFootfall } from '../../src/modules/footfall/application/summariseFootfall.js';
import { summariseRegistrations } from '../../src/modules/registration/application/summariseRegistrations.js';
import { summariseGifts } from '../../src/modules/gift/application/summariseGifts.js';

beforeEach(() => {
  vi.clearAllMocks();
});
const calls = [
  {
    name: 'footfall',
    run: () => summariseFootfall({ eventId: 'event' }, { eventDayId: 'day', bucket: '30m' }),
    mock: mocks.footfall,
  },
  {
    name: 'registrations',
    run: () =>
      summariseRegistrations({ eventId: 'event' }, { eventDayId: 'day', groupBy: 'category' }),
    mock: mocks.registrations,
  },
  {
    name: 'gifts',
    run: () => summariseGifts({ eventId: 'event' }, { eventDayId: 'day' }),
    mock: mocks.gifts,
  },
];
it.each(calls)(
  'passes the selected operational day to $name totals and fallback queries',
  async ({ run, mock }) => {
    await run();
    const expected = { from: mocks.range.start, to: mocks.range.end };
    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'event' }),
      expect.objectContaining(expected),
    );
    expect(mocks.fallback).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'event' }),
      expect.objectContaining(expected),
    );
  },
);
