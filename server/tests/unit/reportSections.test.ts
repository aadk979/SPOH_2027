import { describe, expect, it } from 'vitest';
import {
  footfallSection,
  medianOf,
  volunteersSection,
} from '../../src/modules/report/domain/sections.js';

/** Report section builders (P06.8), without a database. */

const names = new Map([['hall', 'Hall']]);

describe('report sections', () => {
  it('takes the middle value, or the mean of the middle two', () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf([9, 1, 5])).toBe(5);
    expect(medianOf([10, 2, 4, 8])).toBe(6);
  });

  it("finds each station's busiest 30-minute block", () => {
    const at = (iso: string) => new Date(iso);
    const section = footfallSection(
      {
        total: 30,
        curve: [
          { stationId: 'hall', bucketStart: at('2027-01-07T02:00:00.000Z'), value: 10 },
          { stationId: 'hall', bucketStart: at('2027-01-07T02:30:00.000Z'), value: 20 },
        ],
        bySource: [],
      },
      names,
    );
    expect(section.byStation).toEqual([
      {
        stationId: 'hall',
        stationName: 'Hall',
        total: 30,
        peakBlockStart: '2027-01-07T02:30:00.000Z',
        peakBlockValue: 20,
      },
    ]);
  });

  it('counts a missed shift as a no-show only once the shift has ended', () => {
    const attendance = [
      {
        stationId: 'hall',
        checkedInAt: null,
        checkedOutAt: null,
        shift: { endsAt: new Date('2027-01-07T06:00:00.000Z') },
      },
      {
        stationId: 'hall',
        checkedInAt: null,
        checkedOutAt: null,
        shift: { endsAt: new Date('2027-01-07T10:00:00.000Z') },
      },
    ];
    const section = volunteersSection(attendance, {
      volunteersActive: 2,
      stationName: names,
      now: new Date('2027-01-07T06:00:00.000Z'),
    });
    expect(section.noShows).toBe(1);
    expect(section.notYetDue).toBe(1);
  });
});
