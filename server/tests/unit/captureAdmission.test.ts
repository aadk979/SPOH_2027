import { expect, it } from 'vitest';
import { admittedCaptureTime } from '../../src/platform/db/captureAdmission.js';

const closedAt = new Date('2027-01-07T10:00:00Z');
const before = new Date(closedAt.getTime() - 1).toISOString();
const base = {
  status: 'CLOSED' as const,
  closedAt,
  now: closedAt,
  graceHours: 24,
  clientRecordedAt: before,
};

it.each(['DRAFT', 'READY', 'ARCHIVED'] as const)(
  'refuses capture in %s even with a pre-close timestamp',
  (status) => {
    expect(() => admittedCaptureTime({ ...base, status })).toThrow('Capture is closed');
  },
);

it.each(['LIVE', 'REHEARSAL'] as const)('uses receipt time for open %s capture', (status) => {
  expect(admittedCaptureTime({ ...base, status })).toEqual(closedAt);
});

it.each([0, 24 * 3600_000])('accepts a pre-close capture at grace boundary %i ms', (offset) => {
  expect(admittedCaptureTime({ ...base, now: new Date(closedAt.getTime() + offset) })).toEqual(
    new Date(before),
  );
});

it.each([
  { clientRecordedAt: undefined },
  { clientRecordedAt: 'invalid' },
  { clientRecordedAt: closedAt.toISOString() },
  { clientRecordedAt: new Date(closedAt.getTime() + 1).toISOString() },
  { closedAt: null },
  { now: new Date(closedAt.getTime() - 1) },
  { now: new Date(closedAt.getTime() + 24 * 3600_000 + 1) },
])('refuses an invalid close exception: %j', (change) => {
  expect(() => admittedCaptureTime({ ...base, ...change })).toThrow(
    'Only captures recorded before close',
  );
});

it('honours an event-specific shorter grace period', () => {
  expect(() =>
    admittedCaptureTime({ ...base, graceHours: 1, now: new Date(closedAt.getTime() + 3600_001) }),
  ).toThrow('Only captures recorded before close');
});
