import type { Action, FlaggedRedemption, LiveDashboardResponse, RedemptionFlag, WorkspaceDestination } from '@spoh/shared';
const FLAG_TEXT: Record<RedemptionFlag, string> = {
  OVER_STOCK: 'handed over after the stock ran out', SECOND_GIFT: 'a second gift for one journey',
};
export function flaggedRedemptionText(redemption: FlaggedRedemption): string {
  return `${redemption.giftTypeName} at ${redemption.stationName}: ${FLAG_TEXT[redemption.flag]}, synced from ${redemption.recordedByName}'s phone`;
}
export type AttentionProblem = {
  kind: 'lost-person' | 'critical-incident' | 'fallback' | 'silent-station' | 'stale-recorder' | 'redemption' | 'incident';
  text: string;
  tone: 'alert' | 'warn';
  target: WorkspaceDestination | null;
  action: Action;
};
function activeLostPersonText(count: number): string {
  return `${count} active lost-person alert${count === 1 ? '' : 's'}`;
}
function silentStationText(station: LiveDashboardResponse['dataHealth']['silentStations'][number]): string {
  return station.minutesSinceLastActivity === null
    ? `${station.stationName} has recorded nothing at all today`
    : `${station.stationName} has recorded nothing for ${station.minutesSinceLastActivity} minutes`;
}
export function attentionProblems(data: Pick<LiveDashboardResponse, 'safety' | 'dataHealth'>): AttentionProblem[] {
  const problems: AttentionProblem[] = [];
  const observation = { asOf: data.dataHealth.asOf, includeRehearsal: data.dataHealth.rehearsalIncluded ?? false };
  if (data.safety.activeLostPersonAlerts > 0) problems.push({ kind: 'lost-person',
    text: activeLostPersonText(data.safety.activeLostPersonAlerts), tone: 'alert', action: 'Self.Read',
    target: { type: 'records', filter: { kind: 'lost-person', status: 'ACTIVE', ...observation } } });
  if (data.safety.criticalIncidents > 0) problems.push({ kind: 'critical-incident', text: `${data.safety.criticalIncidents} critical incidents open`, tone: 'alert', action: 'Incident.Read',
    target: { type: 'records', filter: { kind: 'incidents', open: true, severity: 'CRITICAL', ...observation } } });
  if (data.dataHealth.fallbackWindowOpen) problems.push({ kind: 'fallback', text: 'A fallback window is open — data is degraded', tone: 'warn', action: 'Dashboard.ReadStation',
    target: { type: 'records', filter: { kind: 'fallback', open: true, ...observation } } });
  for (const station of data.dataHealth.silentStations) problems.push({ kind: 'silent-station',
    text: silentStationText(station), tone: 'warn', action: 'Self.Read',
    target: { type: 'entity', target: { kind: 'station', id: station.stationId } } });
  for (const device of data.dataHealth.staleDevices) problems.push({ kind: 'stale-recorder',
    text: `${device.volunteerName} (${device.stationName}) is checked in but has recorded nothing`, tone: 'warn', action: 'Roster.ReadStation',
    target: device.assignmentId ? { type: 'entity', target: { kind: 'assignment', id: device.assignmentId } } : null });
  for (const redemption of data.dataHealth.flaggedRedemptions) problems.push({ kind: 'redemption', text: flaggedRedemptionText(redemption), tone: 'warn', action: 'Dashboard.ReadStation',
    target: { type: 'entity', target: { kind: 'redemption', id: redemption.redemptionId } } });
  if (data.safety.openIncidents > 0) problems.push({ kind: 'incident', text: `${data.safety.openIncidents} incidents open`, tone: 'warn', action: 'Incident.Read',
    target: { type: 'records', filter: { kind: 'incidents', open: true, ...observation } } });
  return problems;
}
