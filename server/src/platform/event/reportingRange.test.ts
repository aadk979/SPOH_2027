import { beforeEach, expect, it, vi } from 'vitest';
import { NotFoundError } from '../errors/index.js';
const window = vi.hoisted(() => vi.fn());
vi.mock('./events.js', () => ({ eventDayWindow: window }));
import { reportingRange } from './reportingRange.js';

const scope = { eventId: 'event' };
const start = new Date('2026-01-05T22:00:00Z');
const end = new Date('2026-01-06T22:00:00Z');
beforeEach(() => {
  window.mockReset().mockResolvedValue({ start, end });
});

it.each([
  {},
  { from: '2026-01-06T04:00:00Z' },
  { to: '2026-01-06T12:00:00Z' },
  { from: '2026-01-06T04:00:00Z', to: '2026-01-06T12:00:00Z' },
])('preserves explicit all-days bounds without a day lookup: %j', async (query) => {
  expect(await reportingRange(scope, query)).toEqual(
    Object.fromEntries(Object.entries(query).map(([key, value]) => [key, new Date(value)])),
  );
  expect(window).not.toHaveBeenCalled();
});

it('selects the operational window through an event-scoped lookup', async () => {
  expect(await reportingRange(scope, { eventDayId: 'day' })).toEqual({ from: start, to: end });
  expect(window).toHaveBeenCalledWith(scope, 'day');
});

it('narrows both bounds instead of replacing an explicit interval', async () => {
  const query = { eventDayId: 'day', from: '2026-01-06T04:00:00Z', to: '2026-01-06T12:00:00Z' };
  expect(await reportingRange(scope, query)).toEqual({
    from: new Date(query.from),
    to: new Date(query.to),
  });
});

it('clips bounds that extend outside the selected day', async () => {
  expect(
    await reportingRange(scope, {
      eventDayId: 'day',
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
    }),
  ).toEqual({ from: start, to: end });
});

it('keeps a disjoint intersection empty', async () => {
  const range = await reportingRange(scope, { eventDayId: 'day', to: '2026-01-04T00:00:00Z' });
  expect(range.from).toBe(start);
  expect(range.to!.getTime()).toBeLessThan(range.from!.getTime());
});

it('propagates a missing or foreign day rather than falling back to all days', async () => {
  window.mockRejectedValue(new NotFoundError('Event day'));
  await expect(reportingRange(scope, { eventDayId: 'foreign' })).rejects.toBeInstanceOf(
    NotFoundError,
  );
});
