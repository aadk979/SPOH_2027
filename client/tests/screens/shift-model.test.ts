import { describe, expect, it } from 'vitest';
import type { MeResponse, StationSummary } from '@spoh/shared';
import { stationTiles } from '@/features/shift/model/stationTiles';
function fixture(
  kind: StationSummary['kind'],
  capabilities: MeResponse['capabilities'],
  flags = { countsEntry: false, issuesStamp: false },
): MeResponse {
  return {
    volunteer: {
      id: 'v',
      displayName: 'Volunteer',
      role: 'VOLUNTEER',
      portfolio: null,
      active: true,
    },
    capabilities,
    currentAssignment: {
      id: 'a',
      eventDayId: 'day',
      date: '2026-09-28',
      dayLabel: 'Day',
      block: 'MORNING',
      roleLabel: 'Helper',
      checkedInAt: null,
      checkedOutAt: null,
      station: {
        id: 's',
        code: 'S',
        name: 'Test room',
        kind,
        courseCode: null,
        floor: null,
        active: true,
        sortOrder: 0,
        ...flags,
      },
    },
    upcomingAssignments: [],
    escalationChain: [],
    serverTime: '2026-09-28T02:00:00Z',
  };
}
describe('station capture tiles', () => {
  it('requires both an assignment and a matching capability', () => {
    const me = fixture('SIGNUP_BOOTH', []);
    expect(stationTiles(me)).toEqual([]);
    me.capabilities = ['registration.create'];
    me.currentAssignment = null;
    expect(stationTiles(me)).toEqual([]);
  });
  it('keeps tile order and station hints when several capabilities apply', () => {
    const me = fixture(
      'SIGNUP_BOOTH',
      ['registration.create', 'footfall.create', 'card.stamp', 'gift.redeem'],
      { countsEntry: true, issuesStamp: true },
    );
    expect(stationTiles(me)).toEqual([
      { href: '/capture/registration', label: 'Register a visitor', hint: 'One tap per person' },
      { href: '/capture/footfall', label: 'Count entries', hint: 'Test room' },
      { href: '/capture/stamp', label: 'Stamp a card', hint: 'Scan after stamping by hand' },
    ]);
  });
  it('restricts gifts to Mission Complete and honors station flags', () => {
    const me = fixture('MISSION_COMPLETE', [
      'registration.create',
      'footfall.create',
      'card.stamp',
      'gift.redeem',
    ]);
    expect(stationTiles(me).map((tile) => tile.href)).toEqual(['/capture/redeem']);
  });
});
