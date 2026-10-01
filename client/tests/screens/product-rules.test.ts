import { describe, expect, it } from 'vitest';
import { CountsMode } from '@spoh/shared';
import { countsModeOf, draftOf, sameCountsMode } from '@/features/settings/model/countsMode';

/** The counts rule on the settings screen (ADR-002 §4, P09.14). */
describe('the counts rule', () => {
  it.each([
    { mode: 'separate' },
    { mode: 'headline', source: { count: 'registrations' } },
    { mode: 'headline', source: { count: 'journeys' } },
    { mode: 'headline', source: { count: 'footfall', stationId: 'c00000000000000000000001' } },
  ] as CountsMode[])('round-trips %j through the form', (value) => {
    const back = countsModeOf(draftOf(value));
    expect(back).toEqual(value);
    expect(CountsMode.safeParse(back).success).toBe(true);
  });

  it('has nothing to save while a footfall headline has no station', () => {
    expect(countsModeOf({ mode: 'headline', count: 'footfall', stationId: '' })).toBeNull();
  });

  it('can only express one source, never a sum', () => {
    expect(CountsMode.safeParse({ mode: 'sum' }).success).toBe(false);
    expect(
      CountsMode.safeParse({ mode: 'headline', source: { count: 'registrations+footfall' } })
        .success,
    ).toBe(false);
  });

  it('tells an unchanged rule from a changed one', () => {
    expect(sameCountsMode({ mode: 'separate' }, { mode: 'separate' })).toBe(true);
    expect(
      sameCountsMode({ mode: 'separate' }, { mode: 'headline', source: { count: 'journeys' } }),
    ).toBe(false);
  });
});
