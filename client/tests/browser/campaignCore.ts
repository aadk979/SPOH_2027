import { ACTION_IDS, ClientConfigurationSchema, ClientSettings, ClientSettingsResponse,
  GENERATED_SETTING_DEFAULTS, MeResponse, MfaSetupResponse, MyEvent, MyPermissionsResponse, PublicBranding, SessionResponse, type Action } from '@spoh/shared';
import defaultGrants from '../../../packages/access-policies/default-grants.json';
import { MY_STAFFING_ASSIGNMENT, STAFFING_PERSON, STAFFING_STATION } from '../helpers/staffing';
import type { CampaignResponse } from './campaignTypes';

export const CAMPAIGN_NOW = '2027-01-08T02:00:00.000Z';
export const CAMPAIGN_PERSON = { ...STAFFING_PERSON, role: 'ADMIN' as const, active: true, hasSignedIn: true,
  assignmentCount: 1, deviceCount: 2, lastSeenAt: CAMPAIGN_NOW };
export const CAMPAIGN_TARGET = { ...CAMPAIGN_PERSON, id: 'target', displayName: 'Target Person', email: 'target@example.test', role: 'VOLUNTEER' as const };
export const CAMPAIGN_STATION = { ...STAFFING_STATION, type: { ...STAFFING_STATION.type,
  registersVisitors: true, countsEntry: true, issuesStamp: true, redeemsGifts: true } };
export const CAMPAIGN_ROLE_ACTIONS = ACTION_IDS.filter((action) => defaultGrants.ADMIN.grants.includes(action));
/** Default ADMIN role, own assignment/briefer/recipient, and explicit organisation platform owner. */
export const CAMPAIGN_ACTIONS: Action[] = [...CAMPAIGN_ROLE_ACTIONS,
  'Self.Read', 'Shift.CheckIn', 'Swap.Request', 'Briefing.Complete', 'Alert.Ack', 'Announcement.Ack', 'Attendance.Submit',
  'Platform.ManageAdmins', 'Platform.CreateEvent', 'Platform.CloneEvent', 'Permissions.Edit',
  'Settings.ManageSecurity', 'Settings.ManagePrivacy', 'Event.Reopen', 'Event.Archive'];
export const CAMPAIGN_BRANDING = PublicBranding.parse({ slug: 'mock-event', name: 'Synthetic Campaign Event', accent: '#0066cc',
  publicationId: 'campaign-publication', publicationVersion: 1, logo: null, icons: [],
  themePath: '/api/v1/public/events/mock-event/branding/theme.css?v=campaign-publication',
  manifestPath: '/api/v1/public/events/mock-event/branding/manifest.webmanifest' });
export function campaignEvent(path: string) {
  const structurePaths = ['/setup', '/admin/stations', '/admin/categories', '/admin/days', '/admin/settings', '/admin/gifts', '/admin/cards'];
  const status = ['/admin/close-out', '/reports'].includes(path) ? 'CLOSED' : structurePaths.includes(path) ? 'REHEARSAL' : 'LIVE';
  return MyEvent.parse({ id: 'evt_mock', slug: 'mock-event', name: 'Synthetic Campaign Event', timezone: 'Asia/Singapore',
    locale: 'en-SG', status, role: 'ADMIN', membershipStatus: 'ACTIVE', servesLegacyPaths: true });
}
export function campaignActions(path: string): Action[] {
  return CAMPAIGN_ACTIONS.filter((action) => action !== 'Structure.Change' || campaignEvent(path).status === 'REHEARSAL');
}
export function campaignSession(mfa = false) {
  return SessionResponse.parse({ accessToken: 'synthetic-campaign-session', tokenType: 'Bearer', expiresIn: 3600,
    volunteer: { id: CAMPAIGN_PERSON.id, displayName: CAMPAIGN_PERSON.displayName, role: CAMPAIGN_PERSON.role }, refreshAvailable: true, mfaRequired: mfa });
}
export function campaignCoreResponses(path: string): CampaignResponse[] {
  const event = campaignEvent(path);
  const settings = ClientSettingsResponse.parse({ settings: Object.fromEntries(Object.keys(ClientSettings.shape)
    .map((key) => [key, GENERATED_SETTING_DEFAULTS[key as keyof typeof GENERATED_SETTING_DEFAULTS]])) });
  const me = MeResponse.parse({ volunteer: { id: CAMPAIGN_PERSON.id, displayName: CAMPAIGN_PERSON.displayName,
    role: CAMPAIGN_PERSON.role, portfolio: CAMPAIGN_PERSON.portfolio, active: CAMPAIGN_PERSON.active },
    event: { id: event.id, name: event.name, timezone: event.timezone, locale: event.locale, status: event.status },
    currentAssignment: { ...MY_STAFFING_ASSIGNMENT, station: CAMPAIGN_STATION },
    upcomingAssignments: [{ ...MY_STAFFING_ASSIGNMENT, station: CAMPAIGN_STATION }],
    escalationChain: [{ id: 'campaign-lead', displayName: 'Synthetic Lead', role: 'CHIEF_COORDINATOR', phone: '+6500002222', portfolio: null }],
    serverTime: CAMPAIGN_NOW, operationalDate: '2027-01-08' });
  return [
    { path: '/api/v1/client-config', body: { data: ClientConfigurationSchema.parse({ version: 1, apiBaseUrl: '', envLabel: 'development', authProvider: 'local', cognito: null }) } },
    { path: '/api/v1/auth/refresh', method: 'POST', body: campaignSession(path === '/mfa') },
    { path: '/api/v1/auth/mfa/setup', method: 'POST', body: MfaSetupResponse.parse({ secretCode: 'SYNTHETICSETUPKEY' }) },
    { path: '/api/v1/events', body: { data: MyEvent.array().parse([event, { ...event, id: 'evt_other', slug: 'other-event', name: 'Synthetic Other Event' }]) } },
    { path: '/me', body: me },
    { path: '/me/permissions', body: MyPermissionsResponse.parse({ actions: Object.fromEntries(campaignActions(path).map((action) => [action, true])),
      settings: { operational: true, security: true, privacy: true } }) },
    { path: '/admin/settings/client', body: settings },
    { path: '/api/v1/public/events/mock-event/branding', body: { data: CAMPAIGN_BRANDING } },
    { path: '/api/v1/public/events/mock-event/branding/theme.css', query: { v: CAMPAIGN_BRANDING.publicationId },
      contentType: 'text/css', body: ':root { --color-primary: #0066cc; }' },
    { path: '/api/v1/public/events/mock-event/branding/manifest.webmanifest', contentType: 'application/manifest+json',
      body: { name: CAMPAIGN_BRANDING.name, short_name: 'Ops', start_url: '/e/mock-event/home', display: 'standalone',
        theme_color: CAMPAIGN_BRANDING.accent, background_color: '#ffffff', icons: [] } },
  ];
}
