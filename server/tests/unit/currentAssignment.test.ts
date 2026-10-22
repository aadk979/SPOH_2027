import { expect, it } from 'vitest';
import { currentAssignment } from '../../src/modules/me/domain/currentAssignment.js';

const now = new Date('2026-10-23T01:00:00Z');
const posting = (id: string, start: string, end: string) => ({
  id,
  shift: { startsAt: new Date(start), endsAt: new Date(end) },
});
const old = posting('old', '2026-10-14T00:00Z', '2026-10-14T12:00Z');
const active = posting('active', '2026-10-23T00:00Z', '2026-10-23T12:00Z');

it('prefers the actual current posting over an older rehearsal posting', () => {
  expect(currentAssignment([old, active], new Set(['old', 'active']), now)).toBe(active);
});

it('retains rehearsal outside-hours access when no scheduled posting is current', () => {
  expect(currentAssignment([old], new Set(['old']), now)).toBe(old);
});

it('never selects a posting that the running-shift check did not permit', () => {
  expect(currentAssignment([old, active], new Set(['old']), now)).toBe(old);
  expect(currentAssignment([old, active], new Set(), now)).toBeNull();
});

it('uses inclusive starts and exclusive ends during handover', () => {
  const ending = posting('ending', '2026-10-23T00:00Z', now.toISOString());
  const starting = posting('starting', now.toISOString(), '2026-10-23T12:00Z');
  expect(currentAssignment([ending, starting], new Set(['ending', 'starting']), now)).toBe(
    starting,
  );
});

it('keeps the existing first-permitted choice when scheduled shifts overlap', () => {
  expect(
    currentAssignment([active, { ...active, id: 'second' }], new Set(['active', 'second']), now),
  ).toBe(active);
});
