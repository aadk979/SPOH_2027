import { describe, expect, it } from 'vitest';
import { reaches } from '../../src/modules/announcement/domain/audience.js';

/** The one audience rule (F03-014), without a database. */

const ic = { role: 'IC' as const, todaysStationIds: ['booth'], todaysEventDayIds: ['day1'] };
const deputy = { role: 'DEPUTY_COORDINATOR' as const, todaysStationIds: [], todaysEventDayIds: [] };

describe('announcement audience', () => {
  it('reaches everyone when nothing is targeted', () => {
    const all = { role: null, stationId: null, eventDayId: null };
    expect(reaches(all, ic)).toBe(true);
    expect(reaches(all, deputy)).toBe(true);
  });

  it('matches the role exactly, not the role and everyone above it', () => {
    const ics = { role: 'IC' as const, stationId: null, eventDayId: null };
    expect(reaches(ics, ic)).toBe(true);
    expect(reaches(ics, deputy)).toBe(false);
  });

  it('matches a station or a day against the roster for today', () => {
    expect(reaches({ role: null, stationId: 'booth', eventDayId: null }, ic)).toBe(true);
    expect(reaches({ role: null, stationId: 'desk', eventDayId: null }, ic)).toBe(false);
    expect(reaches({ role: null, stationId: null, eventDayId: 'day1' }, ic)).toBe(true);
    expect(reaches({ role: null, stationId: null, eventDayId: 'day2' }, ic)).toBe(false);
    expect(reaches({ role: null, stationId: 'booth', eventDayId: null }, deputy)).toBe(false);
  });
});
