import { beforeEach, expect, it, vi } from 'vitest';
import { NotFoundError } from '../errors/index.js';

const db = vi.hoisted(() => ({ day: vi.fn(), event: vi.fn() }));
vi.mock('../db/client.js', () => ({
  prisma: {
    eventDay: { findFirst: db.day },
    event: { findUniqueOrThrow: db.event },
  },
}));
vi.mock('../events/cacheBus.js', () => ({
  onCacheBusRecovered: vi.fn(),
  subscribeCacheEvent: vi.fn(),
}));
import { eventDayWindow, invalidateEventCache } from './events.js';

beforeEach(() => {
  vi.resetAllMocks();
  invalidateEventCache();
});

it.each([
  {
    timezone: 'Asia/Singapore',
    dayBoundaryMinutes: 360,
    date: '2026-01-06',
    from: '2026-01-05T22:00:00.000Z',
    to: '2026-01-06T22:00:00.000Z',
  },
  {
    timezone: 'Europe/London',
    dayBoundaryMinutes: 0,
    date: '2026-03-29',
    from: '2026-03-29T00:00:00.000Z',
    to: '2026-03-29T23:00:00.000Z',
  },
  {
    timezone: 'Europe/London',
    dayBoundaryMinutes: 0,
    date: '2026-10-25',
    from: '2026-10-24T23:00:00.000Z',
    to: '2026-10-26T00:00:00.000Z',
  },
])('resolves the $date operational day in $timezone', async (sample) => {
  db.day.mockResolvedValue({ date: new Date(`${sample.date}T00:00:00Z`) });
  db.event.mockResolvedValue({ ...sample, slug: 'event' });
  const range = await eventDayWindow({ eventId: 'authenticated-event' }, 'selected-day');
  expect(range).toEqual({ start: new Date(sample.from), end: new Date(sample.to) });
  expect(db.day).toHaveBeenCalledWith({
    where: { eventId: 'authenticated-event', id: 'selected-day' },
    select: { date: true },
  });
  expect(db.event).toHaveBeenCalledWith({
    where: { id: 'authenticated-event' },
    select: { timezone: true, dayBoundaryMinutes: true, slug: true },
  });
});

it('refuses an unknown or foreign day before reading any event timezone', async () => {
  db.day.mockResolvedValue(null);
  await expect(
    eventDayWindow({ eventId: 'authenticated-event' }, 'foreign-day'),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect(db.event).not.toHaveBeenCalled();
});
