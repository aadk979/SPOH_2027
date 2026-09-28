import type { LiveDashboardResponse } from '@spoh/shared';

export function attentionProblems(data: Pick<LiveDashboardResponse, 'safety' | 'dataHealth'>) {
  const problems: Array<{ text: string; tone: 'alert' | 'warn' }> = [];

  if (data.safety.activeLostPersonAlerts > 0) {
    problems.push({
      text: `${data.safety.activeLostPersonAlerts} active lost-person alert${data.safety.activeLostPersonAlerts === 1 ? '' : 's'}`,
      tone: 'alert',
    });
  }

  if (data.safety.criticalIncidents > 0) {
    problems.push({
      text: `${data.safety.criticalIncidents} critical incidents open`,
      tone: 'alert',
    });
  }

  if (data.dataHealth.fallbackWindowOpen) {
    problems.push({ text: 'A fallback window is open — data is degraded', tone: 'warn' });
  }

  for (const station of data.dataHealth.silentStations) {
    problems.push({
      text:
        station.minutesSinceLastActivity === null
          ? `${station.stationName} has recorded nothing at all today`
          : `${station.stationName} has recorded nothing for ${station.minutesSinceLastActivity} minutes`,
      tone: 'warn',
    });
  }

  for (const device of data.dataHealth.staleDevices) {
    problems.push({
      text: `${device.volunteerName} (${device.stationName}) is checked in but has recorded nothing`,
      tone: 'warn',
    });
  }

  if (data.safety.openIncidents > 0) {
    problems.push({ text: `${data.safety.openIncidents} incidents open`, tone: 'warn' });
  }

  return problems;
}
