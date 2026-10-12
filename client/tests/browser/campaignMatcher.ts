import type { CampaignResponse } from './campaignTypes';

export interface CampaignRequest { method: string; url: string; eventId: string; responses: readonly CampaignResponse[] }

export function campaignResponsePath(eventId: string, path: string): string {
  return path.startsWith('/api/v1/') ? path : `/api/v1/events/${eventId}${path}`;
}
function queryKey(query: Record<string, string>): string {
  return JSON.stringify(Object.entries(query).sort(([first], [second]) => first.localeCompare(second)));
}
export function campaignResponseKey(eventId: string, response: CampaignResponse): string {
  return `${response.method ?? 'GET'} ${campaignResponsePath(eventId, response.path)} ${queryKey(response.query ?? {})}`;
}
export function assertUniqueCampaignResponses(eventId: string, responses: readonly CampaignResponse[]): void {
  const keys = responses.map((response) => campaignResponseKey(eventId, response));
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate campaign response request key');
}

/** An exact response is the complete allowlist; no suffix/path/method/query fallback exists. */
export function lookupCampaignResponse(input: CampaignRequest): CampaignResponse | undefined {
  const url = new URL(input.url);
  const entries = [...url.searchParams.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return undefined;
  const scoped = /^\/api\/v1\/events\/([^/]+)\//.exec(url.pathname);
  if (scoped && scoped[1] !== input.eventId) return undefined;
  const key = `${input.method} ${url.pathname} ${queryKey(Object.fromEntries(entries))}`;
  return input.responses.find((response) => campaignResponseKey(input.eventId, response) === key);
}
