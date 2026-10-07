/**
 * Where each former legacy setting is changed now. Most moved to the scoped
 * settings catalogue; lost-person retention to the event's counts and visitor
 * data settings (D-16); the organisation-wide keys to the platform admins'
 * organisation settings (D-17).
 */
const ORGANISATION_KEYS: readonly string[] = [
  'dashboardPollSeconds',
  'alertPollSeconds',
  'refreshSessionDays',
  'idempotencyRetentionDays',
];

export function retiredLegacyHome(key: string): 'catalogue' | 'visitorData' | 'organisation' {
  if (key === 'lostPersonPurgeHours') return 'visitorData';
  return ORGANISATION_KEYS.includes(key) ? 'organisation' : 'catalogue';
}
