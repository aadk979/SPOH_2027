import { beforeEach, expect, it, vi } from 'vitest';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';

vi.mock('../../src/platform/db/client.js', () => ({ prisma: {} }));
vi.mock('../../src/modules/station/index.js', () => ({ listStations: vi.fn(async () => []) }));
vi.mock('../../src/modules/branding/index.js', () => ({ freezeBranding: vi.fn(async () => ({})) }));
vi.mock('../../src/platform/settings/eventSettings.js', () => ({
  eventSetting: vi.fn(async () => ({ mode: 'separate' })),
}));
vi.mock('../../src/modules/report/application/sections.js', () => ({
  registrationsReport: vi.fn(async () => ({ total: 0 })),
  footfallReport: vi.fn(async () => ({ byStation: [] })),
  cardsReport: vi.fn(async () => ({ issued: 0 })),
  giftsReport: vi.fn(async () => ({})),
  safetyReport: vi.fn(async () => ({})),
  volunteersReport: vi.fn(async () => ({})),
  integrityReport: vi.fn(async () => ({})),
}));

import { generateReportInTransaction } from '../../src/modules/report/application/generateReport.js';
import { registrationsReport } from '../../src/modules/report/application/sections.js';
import { reportRange } from '../../src/modules/report/application/reportRange.js';

const dayLookup = vi.fn();
const tx = {
  event: {
    findUniqueOrThrow: vi.fn(async () => ({
      name: 'Event',
      slug: 'event',
      status: 'LIVE',
      timezone: 'Asia/Singapore',
      dayBoundaryMinutes: 360,
    })),
  },
  eventDay: { findFirst: dayLookup },
} as unknown as PrismaTransactionClient;

beforeEach(() => {
  vi.clearAllMocks();
  dayLookup.mockResolvedValue({ date: new Date('2027-01-07T00:00:00Z') });
});

it('limits every report section and public range to the event-owned operational day', async () => {
  const report = await generateReportInTransaction(
    tx,
    { eventId: 'event' },
    { query: { eventDayId: 'day' } },
  );
  expect(report.range).toEqual({
    from: '2027-01-06T22:00:00.000Z',
    to: '2027-01-07T22:00:00.000Z',
  });
  expect(dayLookup).toHaveBeenCalledWith({
    where: { eventId: 'event', id: 'day' },
    select: { date: true },
  });
  expect(registrationsReport).toHaveBeenCalledWith(
    expect.objectContaining({ db: tx }),
    expect.objectContaining({
      from: new Date(report.range.from!),
      to: new Date(report.range.to!),
      eventDayId: 'day',
    }),
  );
});

it('refuses a day outside the event before reading report sections', async () => {
  dayLookup.mockResolvedValue(null);
  await expect(
    generateReportInTransaction(tx, { eventId: 'event' }, { query: { eventDayId: 'foreign' } }),
  ).rejects.toThrow('Event day');
  expect(registrationsReport).not.toHaveBeenCalled();
});

const zone = { timezone: 'Asia/Singapore', dayBoundaryMinutes: 360 };
const scope = { eventId: 'event', db: tx, includeRehearsal: false };

it('preserves absent and explicit all-days bounds without a day lookup', async () => {
  const unbounded = await reportRange(scope, {}, zone);
  expect(unbounded.range).toEqual({ from: null, to: null });
  expect(unbounded.span.from).toEqual(new Date(0));
  expect(unbounded.span.to).toEqual(new Date(8.64e15));
  const query = { from: '2027-01-07T01:00:00Z', to: '2027-01-07T02:00:00Z' };
  expect((await reportRange(scope, query, zone)).range).toEqual(query);
  expect(dayLookup).not.toHaveBeenCalled();
});

it.each([
  {
    from: '2027-01-07T01:00:00Z',
    to: '2027-01-07T02:00:00Z',
    expectedFrom: '2027-01-07T01:00:00.000Z',
    expectedTo: '2027-01-07T02:00:00.000Z',
  },
  {
    from: '2027-01-06T01:00:00Z',
    to: '2027-01-08T02:00:00Z',
    expectedFrom: '2027-01-06T22:00:00.000Z',
    expectedTo: '2027-01-07T22:00:00.000Z',
  },
  {
    from: '2027-01-08T01:00:00Z',
    to: '2027-01-09T02:00:00Z',
    expectedFrom: '2027-01-08T01:00:00.000Z',
    expectedTo: '2027-01-07T22:00:00.000Z',
  },
])(
  'intersects explicit bounds without widening them: $from',
  async ({ from, to, expectedFrom, expectedTo }) => {
    expect((await reportRange(scope, { eventDayId: 'day', from, to }, zone)).range).toEqual({
      from: expectedFrom,
      to: expectedTo,
    });
  },
);

it('uses a 23-hour DST day and retains the selected attendance day identifier', async () => {
  dayLookup.mockResolvedValue({ date: new Date('2026-03-29T00:00:00Z') });
  const result = await reportRange(
    scope,
    { eventDayId: 'day' },
    { timezone: 'Europe/London', dayBoundaryMinutes: 0 },
  );
  expect(result.range).toEqual({
    from: '2026-03-29T00:00:00.000Z',
    to: '2026-03-29T23:00:00.000Z',
  });
  expect(result.span.eventDayId).toBe('day');
});
