import { ACTION_IDS, ACTION_LABELS, AuditEntryRecord, CardPrintExportListResponse, collection, EventAdministrationResponse,
  GiftListResponse, GoLiveCheckCode, LifecycleReadinessResponse, PersonDetailResponse, RolePermissionsResponse,
  SessionSummary, ScheduleTimelineResponse, FallbackWindowRecord, type EventStatus } from '@spoh/shared';
import { EXISTING_GIFT, STORED_PDF, STORED_ZIP } from '../e2e/stockPrintUiFixture';
import { CAMPAIGN_ROLE_ACTIONS, CAMPAIGN_NOW, CAMPAIGN_PERSON, CAMPAIGN_TARGET, campaignEvent } from './campaignCore';
import type { CampaignResponse } from './campaignTypes';

function lifecycle(eventId: string, status: EventStatus) {
  return LifecycleReadinessResponse.parse({ lifecycle: { eventId, status, version: 4, hasBeenLive: true },
    evaluatedAt: CAMPAIGN_NOW, reopenUntil: null,
    goLiveReadiness: GoLiveCheckCode.options.map((code) => ({ code, state: 'passed', passed: true, reasons: [] })),
    transitions: [{ to: status === 'CLOSED' ? 'ARCHIVED' : 'CLOSED', allowed: true, requiresReason: false, blockers: [] }] });
}
function rolePermissions() {
  return RolePermissionsResponse.parse({ data: { roles: [{ role: 'ADMIN', rank: 60, grants: CAMPAIGN_ROLE_ACTIONS, anyStation: true }],
    actions: ACTION_IDS.map((action) => ({ action, label: ACTION_LABELS[action], groups: [], editable: false, minimumRole: null })),
    guardrails: [{ id: 'event-isolation', explanation: 'Every operation remains in its selected event.' }], canEdit: true,
    review: { version: 1, reviewedVersion: 1, reviewedAt: CAMPAIGN_NOW } } });
}
export function campaignAdminResponses(path: string): CampaignResponse[] {
  const event = campaignEvent(path); const eventId = event.id;
  const gift = GiftListResponse.parse({ data: [{ ...EXISTING_GIFT, rehearsal: event.status === 'REHEARSAL' }], meta: { count: 1 } });
  const schedule = ScheduleTimelineResponse.parse({ eventId, evaluatedAt: CAMPAIGN_NOW, data: [{ id: 'campaign-schedule', eventId,
    kind: 'REPORT', scheduledFor: '2027-01-08T05:00:00.000Z', runAt: '2027-01-08T05:00:00.000Z', status: 'PENDING', version: 1,
    attempts: 0, maxAttempts: 5, recurring: false, createdByYou: true, createdAt: CAMPAIGN_NOW, completedAt: null, lastError: null }],
  meta: { count: 1, nextCursor: null } });
  const fallback = FallbackWindowRecord.parse({ id: 'campaign-fallback', stationId: 'station', stationName: 'Room', tier: 3,
    reason: 'Paper count retained during a network outage.', startedAt: '2027-01-08T01:15:00.000Z', endedAt: '2027-01-08T01:45:00.000Z',
    declaredById: CAMPAIGN_PERSON.id, declaredByName: CAMPAIGN_PERSON.displayName, rehearsal: false, open: false, durationMinutes: 30 });
  const audit = collection(AuditEntryRecord).parse({ data: [{ id: 'campaign-audit', action: 'registration.void', entityType: 'Registration',
    entityId: 'registration', actorId: CAMPAIGN_PERSON.id, actorName: CAMPAIGN_PERSON.displayName, before: { voided: false },
    after: { voided: true }, requestId: 'campaign-request', createdAt: CAMPAIGN_NOW }], meta: { count: 1, nextCursor: null } });
  const printRows = [STORED_PDF, STORED_ZIP].map(({ shortCodes: _codes, printContext: _context, ...row }) => row);
  return [
    { path: '/api/v1/events/administration', body: EventAdministrationResponse.parse({ organisations: [{ id: 'organisation', name: 'Synthetic School',
      timezone: event.timezone, locale: event.locale, canCreate: true, canClone: true }], events: [{ id: event.id, name: event.name,
      timezone: event.timezone, locale: event.locale, status: event.status, slug: event.slug, organisationId: 'organisation', venue: 'Synthetic Hall' }] }) },
    { path: '/api/v1/auth/sessions', body: { data: ['current', 'other'].map((id) => SessionSummary.parse({ id, current: id === 'current',
      userAgent: id === 'current' ? 'This synthetic browser' : 'Borrowed synthetic browser', issuedAt: CAMPAIGN_NOW,
      lastUsedAt: CAMPAIGN_NOW, expiresAt: '2027-01-09T02:00:00.000Z' })) } },
    { path: '/api/v1/people/person', body: PersonDetailResponse.parse({ person: { id: CAMPAIGN_PERSON.id,
      displayName: CAMPAIGN_PERSON.displayName, email: CAMPAIGN_PERSON.email, deactivatedAt: null }, memberships: [{
      id: 'membership', eventId, eventName: event.name, role: 'ADMIN', status: 'ACTIVE', acceptedAt: CAMPAIGN_NOW, lastSeenAt: CAMPAIGN_NOW }] }) },
    { path: '/api/v1/people/target', body: PersonDetailResponse.parse({ person: { id: CAMPAIGN_TARGET.id,
      displayName: CAMPAIGN_TARGET.displayName, email: CAMPAIGN_TARGET.email, deactivatedAt: null }, memberships: [{
      id: 'target-membership', eventId, eventName: event.name, role: CAMPAIGN_TARGET.role, status: 'ACTIVE', acceptedAt: CAMPAIGN_NOW, lastSeenAt: CAMPAIGN_NOW }] }) },
    { path: '/permissions', body: rolePermissions() }, { path: '/lifecycle/readiness', body: lifecycle(eventId, event.status) },
    { path: '/schedules', query: { limit: '20', status: 'PENDING' }, body: schedule },
    { path: '/schedules', query: { limit: '20' }, body: schedule },
    { path: '/fallback/windows', body: { data: [fallback] } },
    { path: '/gifts/catalogue', body: gift }, { path: '/gifts', body: gift },
    { path: '/cards/print', query: { limit: '20' }, body: CardPrintExportListResponse.parse({ data: printRows, meta: { count: 2, nextCursor: null } }) },
    { path: '/audit', query: { limit: '50' }, body: audit },
  ];
}
