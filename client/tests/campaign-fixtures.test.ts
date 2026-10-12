import type { Page, Route } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { ClientConfigurationSchema, MyPermissionsResponse, PublicBranding, RolePermissionsResponse } from '@spoh/shared';
import defaultGrants from '../../packages/access-policies/default-grants.json';
import { campaignPageUrl, campaignResponses, installCampaignFixture } from './browser/campaignFixtures';
import { assertUniqueCampaignResponses, campaignResponseKey, lookupCampaignResponse } from './browser/campaignMatcher';
import { CAMPAIGN_ROUTES } from './browser/routeManifest';
import type { CampaignResponse } from './browser/campaignTypes';

const eventId = 'evt_mock';
const responses: CampaignResponse[] = [
  { path: '/me', body: { data: 'self' } },
  { path: '/workspace/records', query: { kind: 'footfall', stationId: 'CasePreserved', limit: '50' }, body: { data: 'subset' } },
  { path: '/api/v1/auth/refresh', method: 'POST', body: { data: 'session' } },
];
const resolve = (method: string, path: string) => lookupCampaignResponse({ method, url: `https://campaign.test${path}`, eventId, responses });

describe('strict campaign request allowlist', () => {
  it('matches only the exact GET resource and explicit POST auth endpoint', () => {
    expect(resolve('GET', '/api/v1/events/evt_mock/me')).toBe(responses[0]);
    expect(resolve('POST', '/api/v1/auth/refresh')).toBe(responses[2]);
    for (const method of ['POST', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) expect(resolve(method, '/api/v1/events/evt_mock/me')).toBeUndefined();
    expect(resolve('GET', '/api/v1/auth/refresh')).toBeUndefined();
  });
  it('matches the complete allowed query in any order while retaining resource case', () => {
    expect(resolve('GET', '/api/v1/events/evt_mock/workspace/records?limit=50&stationId=CasePreserved&kind=footfall')).toBe(responses[1]);
    expect(resolve('GET', '/api/v1/events/evt_mock/workspace/records?kind=footfall&stationId=casepreserved&limit=50')).toBeUndefined();
  });
  it.each([
    '/api/v1/events/foreign/me', '/api/v1/events/evt_mock/not-implemented', '/api/v1/events/evt_mock/me/extra',
    '/api/v1/events/evt_mock/me?q=private', '/api/v1/events/evt_mock/workspace/records?kind=footfall&limit=50',
    '/api/v1/events/evt_mock/workspace/records?kind=footfall&stationId=CasePreserved&limit=50&unexpected=true',
    '/api/v1/events/evt_mock/workspace/records?kind=footfall&stationId=CasePreserved&limit=50&limit=50',
    '/api/v1/events/evt_mock/workspace/records?kind=footfall&stationId=CasePreserved&limit=50&%6Cimit=50',
    '/api/v1/events/evt_mock/workspace/records?kind=footfall&stationId=CasePreserved&limit=100',
    '/api/v1/events/evt_mock/me?eventId=foreign', '/api/v1/public/events/foreign/branding',
  ])('rejects foreign, unknown, missing, repeated or unsupported request: %s', (path) => {
    expect(resolve('GET', path)).toBeUndefined();
  });
  it('rejects a foreign event even if a response was accidentally inserted for it', () => {
    expect(lookupCampaignResponse({ method: 'GET', url: 'https://campaign.test/api/v1/events/foreign/me', eventId,
      responses: [{ path: '/api/v1/events/foreign/me', body: { data: 'wrong event' } }] })).toBeUndefined();
  });
  it('refuses ambiguous fixture definitions rather than selecting the first one', () => {
    const duplicate = { ...responses[1]!, query: { limit: '50', stationId: 'CasePreserved', kind: 'footfall' } };
    expect(() => assertUniqueCampaignResponses(eventId, [...responses, duplicate])).toThrow('Duplicate campaign response');
    expect(() => assertUniqueCampaignResponses(eventId, [...responses, { path: '/me', method: 'POST', body: null }])).not.toThrow();
  });
});

describe('complete populated campaign response construction', () => {
  it.each(CAMPAIGN_ROUTES)('constructs schema-validated distinct families for $path', (entry) => {
    const values = campaignResponses(entry);
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values.map((value) => campaignResponseKey(eventId, value))).size).toBe(values.length);
    expect(values.every((value) => value.body !== undefined && JSON.stringify(value.body) !== '{}')).toBe(true);
    expect(values.filter((value) => (value.status ?? 200) >= 400)).toEqual([]);
  });
  it('provides runtime configuration and a published neutral identity with explicit asset resources', () => {
    const entry = CAMPAIGN_ROUTES.find((value) => value.path === '/setup')!;
    const values = campaignResponses(entry);
    const config = values.find((value) => value.path === '/api/v1/client-config')!.body as { data: unknown };
    expect(ClientConfigurationSchema.parse(config.data).authProvider).toBe('local');
    const brand = values.find((value) => value.path === '/api/v1/public/events/mock-event/branding')!.body as { data: unknown };
    const publication = PublicBranding.parse(brand.data);
    expect(publication.logo).toBeNull(); expect(publication.icons).toEqual([]);
    for (const path of [publication.themePath, publication.manifestPath]) {
      expect(lookupCampaignResponse({ method: 'GET', url: `https://campaign.test${path}`, eventId, responses: values })).toBeDefined();
    }
  });
  it.each(['/sign-in', '/mfa'])('withholds operational/private response families from the restricted %s screen', (path) => {
    const values = campaignResponses(CAMPAIGN_ROUTES.find((entry) => entry.path === path)!);
    for (const resource of ['/me', '/visitors', '/dashboard/live']) {
      expect(lookupCampaignResponse({ method: 'GET', eventId, responses: values,
        url: `https://campaign.test/api/v1/events/${eventId}${resource}` })).toBeUndefined();
    }
  });
  it('retains actual ADMIN role grants and the live structure freeze', () => {
    const live = campaignResponses(CAMPAIGN_ROUTES.find((entry) => entry.path === '/home')!);
    const permissions = MyPermissionsResponse.parse(live.find((value) => value.path === '/me/permissions')!.body);
    expect(permissions.actions['Structure.Change']).toBeUndefined();
    const roles = RolePermissionsResponse.parse(live.find((value) => value.path === '/permissions')!.body);
    expect(roles.data.roles[0]).toMatchObject({ rank: 60, anyStation: true });
    expect([...roles.data.roles[0]!.grants].sort()).toEqual([...defaultGrants.ADMIN.grants].sort());
    expect(roles.data.roles[0]!.grants).not.toContain('Settings.ManagePrivacy');
  });
  it('matches the announcement API ten-row paging contract and the gift catalogue current pool', () => {
    const inbox = campaignResponses(CAMPAIGN_ROUTES.find((entry) => entry.path === '/inbox')!);
    const request = { method: 'GET', eventId, responses: inbox };
    expect(lookupCampaignResponse({ ...request, url: 'https://campaign.test/api/v1/events/evt_mock/announcements/drafts?limit=10' })).toBeDefined();
    expect(lookupCampaignResponse({ ...request, url: 'https://campaign.test/api/v1/events/evt_mock/announcements/drafts?limit=20' })).toBeUndefined();
    const gifts = campaignResponses(CAMPAIGN_ROUTES.find((entry) => entry.path === '/admin/gifts')!);
    const body = gifts.find((value) => value.path === '/gifts/catalogue')!.body as { data: { rehearsal: boolean }[] };
    expect(body.data[0]!.rehearsal).toBe(true);
  });
  it('opens valid initial record/search/person queries and the root picker redirect', () => {
    const url = (path: string) => campaignPageUrl(CAMPAIGN_ROUTES.find((entry) => entry.path === path)!);
    expect(url('/entity')).toBe('/e/mock-event/entity?kind=station&id=station');
    expect(url('/records')).toBe('/e/mock-event/records?kind=footfall&stationId=station');
    expect(url('/search')).toBe('/e/mock-event/search?query=Room');
    expect(url('/admin/users/person')).toBe('/e/mock-event/admin/users/person?id=target');
    expect(url('/')).toBe('/');
  });
});

describe('installer rejection transport without launching a browser', () => {
  it('records unsupported requests and returns a visible server failure, never an empty success', async () => {
    let handler: ((route: Route) => Promise<void>) | undefined;
    const page = { route: vi.fn(async (_pattern: string, next: typeof handler) => { handler = next; }) } as unknown as Page;
    const fixture = await installCampaignFixture(page, CAMPAIGN_ROUTES.find((entry) => entry.path === '/home')!);
    const fulfill = vi.fn(async () => undefined);
    const request = { method: () => 'DELETE', url: () => 'https://campaign.test/api/v1/events/evt_mock/me' };
    await handler!({ request: () => request, fulfill } as unknown as Route);
    expect(fixture.unexpected).toEqual(['DELETE /api/v1/events/evt_mock/me']);
    expect(fulfill).toHaveBeenCalledWith(expect.objectContaining({ status: 500,
      json: { error: { code: 'UNEXPECTED_FIXTURE_REQUEST', message: 'Campaign request does not match its strict fixture.', requestId: 'campaign-request-mismatch' } } }));
    expect(fixture).toMatchObject({ url: '/e/mock-event/home', expectedUrl: '/e/mock-event/home' });
  });
});
