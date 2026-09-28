import { describe, expect, it } from 'vitest';
import type { LiveDashboardResponse } from '@spoh/shared';
import { attentionProblems } from '@/features/dashboard/model/attentionProblems';
function fixture(): Pick<LiveDashboardResponse, 'safety' | 'dataHealth'> {
  return {
    safety: { activeLostPersonAlerts: 0, criticalIncidents: 0, openIncidents: 0 },
    dataHealth: {
      silentStations: [],
      staleDevices: [],
      fallbackWindowOpen: false,
      withinEventHours: true,
      asOf: '2026-09-28T02:00:00Z',
    },
  };
}
describe('dashboard attention priority', () => {
  it('does not invent problems for an empty response, including outside event hours', () => {
    const data = fixture();
    expect(attentionProblems(data)).toEqual([]);
    data.dataHealth.withinEventHours = false;
    expect(attentionProblems(data)).toEqual([]);
  });
  it('keeps urgent safety first, then degraded capture, then other incidents', () => {
    const data = fixture();
    data.safety = { activeLostPersonAlerts: 1, criticalIncidents: 2, openIncidents: 3 };
    data.dataHealth.fallbackWindowOpen = true;
    data.dataHealth.silentStations = [
      {
        stationId: 'a',
        stationName: 'Room A',
        lastActivityAt: null,
        minutesSinceLastActivity: null,
      },
      {
        stationId: 'b',
        stationName: 'Room B',
        lastActivityAt: '2026-09-28T01:40:00Z',
        minutesSinceLastActivity: 20,
      },
    ];
    data.dataHealth.staleDevices = [
      {
        volunteerId: 'v',
        volunteerName: 'Alex',
        stationName: 'Room C',
        lastCaptureAt: null,
        minutesSinceLastCapture: null,
      },
    ];
    expect(attentionProblems(data)).toEqual([
      { text: '1 active lost-person alert', tone: 'alert' },
      { text: '2 critical incidents open', tone: 'alert' },
      { text: 'A fallback window is open — data is degraded', tone: 'warn' },
      { text: 'Room A has recorded nothing at all today', tone: 'warn' },
      { text: 'Room B has recorded nothing for 20 minutes', tone: 'warn' },
      { text: 'Alex (Room C) is checked in but has recorded nothing', tone: 'warn' },
      { text: '3 incidents open', tone: 'warn' },
    ]);
  });
  it('pluralizes lost-person alerts without promoting ordinary incidents', () => {
    const data = fixture();
    data.safety.activeLostPersonAlerts = 2;
    expect(attentionProblems(data)).toEqual([
      { text: '2 active lost-person alerts', tone: 'alert' },
    ]);
    data.safety.activeLostPersonAlerts = 0;
    data.safety.openIncidents = 1;
    expect(attentionProblems(data)).toEqual([{ text: '1 incidents open', tone: 'warn' }]);
  });
});
