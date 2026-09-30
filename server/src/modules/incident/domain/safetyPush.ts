import type { IncidentSeverity } from '@spoh/shared';

/**
 * Incident reporting (PRODUCT_BRIEF §7.1). An incident is immutable once
 * submitted; corrections go into an append-only follow-up log.
 *
 * Only HIGH and CRITICAL push to the safety chain. A low-severity near-miss is
 * a record, not an interruption, and pushing every one is how the chain learns
 * to ignore the channel before a severe one arrives.
 */
export function pushesToSafetyChain(severity: IncidentSeverity): boolean {
  return severity === 'HIGH' || severity === 'CRITICAL';
}

/**
 * The push the chain receives. The description stays out: it is free text
 * typed in a hurry about a real person, and belongs behind authentication
 * rather than on a lock screen (§7.4).
 */
export function safetyPushMessage(incident: {
  severity: IncidentSeverity;
  type: string;
  stationName: string | null;
}): { title: string; body: string } {
  const what = incident.type.replace(/_/g, ' ').toLowerCase();
  return {
    title: `${incident.severity} incident reported`,
    body: `${what} at ${incident.stationName ?? 'an unlisted location'}. Open the ops app.`,
  };
}
