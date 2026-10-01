import { headlineOf } from '@spoh/shared';
import { describe, expect, it } from 'vitest';

/** The headline rule (ADR-002 §4): one source's own figure, or nothing; never a sum. */
const COUNTS = {
  registrations: 3,
  journeys: 4,
  footfall: [
    { stationId: 'door', stationName: 'Front door', value: 5 },
    { stationId: 'hall', stationName: 'Hall', value: 2 },
  ],
};

describe('headlineOf', () => {
  it('gives no headline in separate mode', () => {
    expect(headlineOf({ mode: 'separate' }, COUNTS)).toBeNull();
  });

  it.each([
    [{ count: 'registrations' as const }, 3],
    [{ count: 'journeys' as const }, 4],
    [{ count: 'footfall' as const, stationId: 'door' }, 5],
    [{ count: 'footfall' as const, stationId: 'hall' }, 2],
  ])('takes %j as that source alone', (source, value) => {
    const headline = headlineOf({ mode: 'headline', source }, COUNTS);
    expect(headline?.value).toBe(value);
    // Never the sum of the counts, whichever source is chosen.
    expect(headline?.value).not.toBe(3 + 7 + 4);
  });

  it('shows zero, still labelled, for a station that recorded nothing in the range', () => {
    const headline = headlineOf(
      { mode: 'headline', source: { count: 'footfall', stationId: 'gone' } },
      COUNTS,
    );
    expect(headline).toMatchObject({
      value: 0,
      sourceLabel: 'from entries counted at the chosen station',
    });
  });
});
