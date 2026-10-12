import type { Page } from '@playwright/test';
import { campaignAdminResponses } from './campaignAdminData';
import { campaignCaptureResponses } from './campaignCaptureData';
import { campaignContentResponses } from './campaignContentData';
import { CAMPAIGN_NOW, CAMPAIGN_PERSON, campaignCoreResponses, campaignEvent } from './campaignCore';
import { assertUniqueCampaignResponses, lookupCampaignResponse } from './campaignMatcher';
import { campaignOperationalResponses } from './campaignOperationalData';
import { assertCampaignReady } from './campaignReadiness';
import { campaignSettingsResponses } from './campaignSettingsData';
import { campaignStructureResponses } from './campaignStructureData';
import { campaignWorkspaceResponses } from './campaignWorkspaceData';
import type { CampaignFixture, CampaignResponse } from './campaignTypes';
import type { CampaignRoute } from './routeManifest';

export function campaignResponses(entry: CampaignRoute): CampaignResponse[] {
  const event = campaignEvent(entry.path);
  const input = { eventId: event.id, personId: CAMPAIGN_PERSON.id, now: CAMPAIGN_NOW, routePath: entry.path };
  const core = campaignCoreResponses(entry.path);
  if (entry.fixture === 'anonymous') return core.filter((response) => response.path === '/api/v1/client-config' || response.path.startsWith('/api/v1/public/'));
  if (entry.fixture === 'identity-mfa') return core.filter((response) => response.path === '/api/v1/client-config' || response.path.startsWith('/api/v1/auth/'));
  const responses = [...core, ...campaignStructureResponses(event.id), ...campaignAdminResponses(entry.path),
    ...campaignContentResponses(event.id), ...campaignOperationalResponses(input), ...campaignSettingsResponses(input),
    ...campaignCaptureResponses(input), ...campaignWorkspaceResponses(input)];
  assertUniqueCampaignResponses(event.id, responses);
  return responses;
}
export function campaignPageUrl(entry: CampaignRoute): string {
  const base = entry.scope === 'event' ? `/e/mock-event${entry.path}` : entry.path;
  const query: Record<string, string> = {
    '/entity': '?kind=station&id=station', '/records': '?kind=footfall&stationId=station', '/search': '?query=Room',
    '/admin/users/person': '?id=target',
  };
  return `${base}${query[entry.path] ?? ''}`;
}

/** Populated synthetic UI data; API/policy/provider acceptance remains the real P16 campaign. */
export async function installCampaignFixture(page: Page, entry: CampaignRoute): Promise<CampaignFixture> {
  const responses = campaignResponses(entry);
  const unexpected: string[] = [];
  const served = new Set<string>();
  const eventId = campaignEvent(entry.path).id;
  if (entry.fixture === 'anonymous') await page.addInitScript(() => localStorage.setItem('@spoh/client/signed-out', '1'));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const response = lookupCampaignResponse({ method: request.method(), url: request.url(), eventId, responses });
    if (!response) {
      unexpected.push(`${request.method()} ${new URL(request.url()).pathname}${new URL(request.url()).search}`);
      await route.fulfill({ status: 500, json: { error: { code: 'UNEXPECTED_FIXTURE_REQUEST',
        message: 'Campaign request does not match its strict fixture.', requestId: 'campaign-request-mismatch' } } });
      return;
    }
    const headers = { 'Cache-Control': 'private, no-store' };
    await route.fulfill(typeof response.body === 'string' ? { status: response.status ?? 200, headers,
      contentType: response.contentType, body: response.body } : { status: response.status ?? 200, headers,
      ...(response.contentType ? { contentType: response.contentType } : {}), json: response.body });
    served.add(response.path);
  });
  const url = campaignPageUrl(entry);
  return { url, expectedUrl: entry.path === '/' ? '/events' : url, unexpected,
    ready: () => assertCampaignReady(page, { entry, served }) };
}
