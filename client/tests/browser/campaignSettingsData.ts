import { AttendanceConfig, BrandingState, CaptureScheduleListResponse, CategoryActivityListResponse,
  CategoryActivityResponse, CategoryScheduleListResponse, EventSettingsResponse, GENERATED_SETTING_DEFAULTS,
  OrganisationSettings, OrganisationSettingsResponse, ScopedSettingsReadResponse, ShiftTemplateRecord,
  scopedOperationalKeys, type ScopedSettingsTarget } from '@spoh/shared';
import { captureSchedule } from '../helpers/captureSchedule';
import { STRUCTURE, STRUCTURE_TEMPLATE } from '../helpers/structure';
import { CAMPAIGN_BRANDING, CAMPAIGN_PERSON, campaignEvent } from './campaignCore';
import type { CampaignContext, CampaignResponse } from './campaignTypes';

function catalogue(input: CampaignContext, target: ScopedSettingsTarget) {
  return ScopedSettingsReadResponse.parse({ eventId: input.eventId, target, eventStatus: campaignEvent(input.routePath).status,
    evaluatedAt: input.now, data: scopedOperationalKeys(target.scope).map((key) => ({ key,
      value: GENERATED_SETTING_DEFAULTS[key], storedVersion: 0, source: { scope: 'default', version: 0 }, invalidScopes: [] })) });
}
function catalogueResponses(input: CampaignContext): CampaignResponse[] {
  return ([{ scope: 'event' }, { scope: 'station', stationId: 'station' }] as const).flatMap((target) => {
    const current = catalogue(input, target);
    const query: Record<string, string> = { scope: target.scope };
    if (target.scope === 'station') query.stationId = target.stationId;
    const schedule = captureSchedule(current, { id: 'campaign-capture-schedule', createdAt: input.now,
      scheduledFor: '2027-01-08T05:00:00.000Z', runAt: '2027-01-08T05:00:00.000Z' });
    const body = CaptureScheduleListResponse.parse({ eventId: input.eventId, target, key: 'capture.open', evaluatedAt: input.now,
      data: [schedule], meta: { count: 1, nextCursor: null } });
    return [{ path: '/admin/settings/catalogue', query, body: current },
      { path: '/admin/settings/catalogue/schedules', query: { ...query, key: 'capture.open', limit: '20' }, body },
      { path: '/admin/settings/catalogue/schedules', query: { ...query, key: 'capture.open', limit: '20', status: 'PENDING' }, body }];
  });
}
function categoryResponses(input: CampaignContext): CampaignResponse[] {
  const category = CategoryActivityResponse.parse({ eventId: input.eventId, eventStatus: campaignEvent(input.routePath).status,
    evaluatedAt: input.now, data: STRUCTURE.categories[0] });
  const schedule = { id: 'campaign-category-schedule', eventId: input.eventId, categoryId: category.data.id,
    kind: 'CAPTURE_CATEGORY', recurring: false, active: false, expectedActive: true, expectedUpdatedAt: category.data.updatedAt,
    reason: 'Stop accepting this category after the tour.', status: 'PENDING', version: 1, attempts: 0, maxAttempts: 5,
    createdByYou: true, createdAt: input.now, scheduledFor: '2027-01-08T05:00:00.000Z', runAt: '2027-01-08T05:00:00.000Z',
    completedAt: null, lastError: null };
  const body = CategoryScheduleListResponse.parse({ eventId: input.eventId, categoryId: category.data.id, evaluatedAt: input.now,
    data: [schedule], meta: { count: 1, nextCursor: null } });
  return [{ path: '/admin/capture-categories', query: { limit: '20' }, body: CategoryActivityListResponse.parse({
    ...category, data: [category.data], meta: { count: 1, nextCursor: null } }) },
  { path: `/admin/capture-categories/${category.data.id}`, body: category },
  { path: `/admin/capture-categories/${category.data.id}/schedules`, query: { limit: '20' }, body },
  { path: `/admin/capture-categories/${category.data.id}/schedules`, query: { limit: '20', status: 'PENDING' }, body }];
}
export function campaignSettingsResponses(input: CampaignContext): CampaignResponse[] {
  const organisation = Object.fromEntries(Object.keys(OrganisationSettings.shape)
    .map((key) => [key, GENERATED_SETTING_DEFAULTS[key as keyof typeof GENERATED_SETTING_DEFAULTS]]));
  return [
    { path: '/admin/shift-templates', body: { data: ShiftTemplateRecord.array().parse([{ id: STRUCTURE_TEMPLATE.id,
      code: STRUCTURE_TEMPLATE.code, label: STRUCTURE_TEMPLATE.label, startLocal: STRUCTURE_TEMPLATE.startLocal,
      endLocal: STRUCTURE_TEMPLATE.endLocal, endsNextDay: STRUCTURE_TEMPLATE.endsNextDay, sortOrder: STRUCTURE_TEMPLATE.sortOrder }]) } },
    { path: '/admin/event-settings', body: EventSettingsResponse.parse({ settings: {
      'product.countsMode': { mode: 'separate' }, 'product.visitorDataMode': 'none', lostPersonPurgeHours: 24 },
    versions: { 'product.countsMode': 0, 'product.visitorDataMode': 0, lostPersonPurgeHours: 0 } }) },
    { path: '/admin/attendance-settings', body: AttendanceConfig.parse({ rootMembershipId: 'membership', rootIsStale: false,
      campusCidrs: ['192.0.2.0/24'], versions: { rootMembershipId: 1, campusCidrs: 1 },
      eligibleRoots: [{ id: 'membership', displayName: CAMPAIGN_PERSON.displayName, email: CAMPAIGN_PERSON.email }] }) },
    { path: '/admin/organisation-settings', body: OrganisationSettingsResponse.parse({ organisationId: 'organisation', settings: organisation,
      versions: Object.fromEntries(Object.keys(OrganisationSettings.shape).map((key) => [key, 0])), canChange: true }) },
    { path: '/branding', body: { data: BrandingState.parse({ eventId: input.eventId, version: 1,
      draft: { accent: CAMPAIGN_BRANDING.accent, logoAlt: null, uploadReceiptId: null }, published: CAMPAIGN_BRANDING, registryRemaining: 19 }) } },
    ...catalogueResponses(input), ...categoryResponses(input),
  ];
}
