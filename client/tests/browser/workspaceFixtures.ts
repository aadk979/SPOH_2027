import type { Page, Route } from '@playwright/test';
import { ActiveLostPersonResponse, CaptureCategoriesResponse, ClientSettings, ClientSettingsResponse,
  EntityQuery, EntityResponse, GENERATED_SETTING_DEFAULTS, MeResponse, MyEvent, MyPermissionsResponse,
  RecordsFilter, RecordsQuery, RecordsResponse, SearchQuery, SearchResponse, SessionResponse, type EntityKind, type RecordsKind } from '@spoh/shared';

export const WORKSPACE_NOW = '2027-01-08T02:00:00.000Z';
export const WORKSPACE_EVENT = MyEvent.parse({ id: 'workspace-event', slug: 'workspace-event', name: 'Synthetic Workspace Event',
  timezone: 'Asia/Singapore', locale: 'en-SG', status: 'LIVE', role: 'IC', membershipStatus: 'ACTIVE', servesLegacyPaths: true });
const person = { id: 'workspace-person', displayName: 'Synthetic IC', role: 'IC' as const };
const session = SessionResponse.parse({ accessToken: 'synthetic-browser-session', tokenType: 'Bearer', expiresIn: 3600, volunteer: person, refreshAvailable: true });
const summary = { id: WORKSPACE_EVENT.id, name: WORKSPACE_EVENT.name, timezone: WORKSPACE_EVENT.timezone, locale: WORKSPACE_EVENT.locale, status: WORKSPACE_EVENT.status };
const me = MeResponse.parse({ volunteer: { ...person, portfolio: null, active: true }, event: summary,
  currentAssignment: null, upcomingAssignments: [], escalationChain: [], serverTime: WORKSPACE_NOW, operationalDate: '2027-01-08' });
const permissions = MyPermissionsResponse.parse({ actions: { 'Self.Read': true, 'Dashboard.ReadStation': true },
  settings: { operational: false, security: false, privacy: false } });
const settings = ClientSettingsResponse.parse({ settings: Object.fromEntries(Object.keys(ClientSettings.shape).map((key) => [key, GENERATED_SETTING_DEFAULTS[key as keyof typeof ClientSettings.shape]])) });

export interface WorkspaceFixtureState { status: number; empty: boolean; entityKind: EntityKind; recordsKind: RecordsKind; unexpected: string[] }
export const workspaceFixtureState = (): WorkspaceFixtureState => ({ status: 200, empty: false, entityKind: 'station', recordsKind: 'footfall', unexpected: [] });

function entity(kind: EntityKind) {
  return EntityResponse.parse({ ref: { kind, id: 'workspace-record' }, title: `Synthetic ${kind} record`,
    fields: [{ label: 'Reference', value: 'CasePreserved', format: 'text' }, { label: 'Observed count', value: 240, format: 'number' }],
    facets: [{ name: 'Private roster', availability: 'denied', explanation: 'This station roster is outside your current access.' }],
    related: [{ label: 'Exact room entries', destination: { type: 'records', filter: { kind: 'footfall', stationId: 'workspace-station', asOf: WORKSPACE_NOW, includeRehearsal: false } } }],
    actions: [], asOf: WORKSPACE_NOW });
}
const units: Record<RecordsKind, RecordsResponse['aggregate']['unit']> = { registrations: 'registrations', footfall: 'roomEntries', cards: 'cards',
  stamps: 'stampRows', redemptions: 'redemptions', incidents: 'incidents', 'lost-person': 'alerts', 'lost-found': 'items', announcements: 'announcements',
  assignments: 'assignments', imports: 'imports', fallback: 'windows', 'gift-ledger': 'stock', audit: 'auditRows', people: 'people', days: 'days' };

function records(filter: RecordsFilter, state: WorkspaceFixtureState, cursor: string | undefined) {
  const timed = RecordsFilter.safeParse({ ...filter, asOf: WORKSPACE_NOW });
  const second = cursor === 'workspace-row-a';
  return RecordsResponse.parse({ filter: timed.success ? timed.data : filter, asOf: WORKSPACE_NOW,
    data: state.empty ? [] : [{ id: second ? 'workspace-row-b' : 'workspace-row-a', title: second ? 'Synthetic older record' : 'Synthetic current record',
      recordedAt: WORKSPACE_NOW, fields: [{ label: 'Contribution', value: filter.kind === 'footfall' ? second ? 1 : 240 : 1, format: 'number' }],
      destination: { kind: 'station', id: 'workspace-record' }, related: [] }],
    aggregate: { value: state.empty ? 0 : filter.kind === 'footfall' ? 241 : 2, unit: units[filter.kind],
      ...(filter.kind === 'gift-ledger' ? { balance: 78, openingStock: 100, explanation: 'Balance uses all retained history in this exact live pool.' } : {}) },
    meta: { count: state.empty ? 0 : 2, nextCursor: state.empty || second ? null : 'workspace-row-a' } });
}

function uniqueQuery(url: URL): Record<string, string> {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) throw new Error('Repeated fixture query key');
  return Object.fromEntries(url.searchParams);
}

async function baseResponse(route: Route, url: URL): Promise<boolean> {
  const path = url.pathname;
  if (url.search) return false;
  if (route.request().method() === 'POST' && path === '/api/v1/auth/refresh') {
    await route.fulfill({ json: session }); return true;
  }
  if (route.request().method() !== 'GET') return false;
  const base: Record<string, unknown> = {
    '/api/v1/client-config': { data: { version: 2, mediaOrigin: null, apiBaseUrl: '', envLabel: 'development', authProvider: 'local', cognito: null } },
    '/api/v1/events': { data: [WORKSPACE_EVENT] },
    [`/api/v1/events/${WORKSPACE_EVENT.id}/me`]: me,
    [`/api/v1/events/${WORKSPACE_EVENT.id}/me/permissions`]: permissions,
    [`/api/v1/events/${WORKSPACE_EVENT.id}/registrations/categories`]: CaptureCategoriesResponse.parse({ data: [] }),
    [`/api/v1/events/${WORKSPACE_EVENT.id}/lost-person/active`]: ActiveLostPersonResponse.parse({ asOf: WORKSPACE_NOW, alerts: [] }),
    [`/api/v1/events/${WORKSPACE_EVENT.id}/admin/settings/client`]: settings,
  };
  if (Object.hasOwn(base, path)) { await route.fulfill({ json: base[path] }); return true; }
  if (path === `/api/v1/public/events/${WORKSPACE_EVENT.slug}/branding`) {
    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Neutral identity', requestId: 'neutral-fixture' } } }); return true;
  }
  return false;
}

async function workspaceResponse(route: Route, url: URL, state: WorkspaceFixtureState): Promise<boolean> {
  if (route.request().method() !== 'GET') return false;
  const base = `/api/v1/events/${WORKSPACE_EVENT.id}/workspace`;
  if (![`${base}/entity`, `${base}/records`, `${base}/search`].includes(url.pathname)) return false;
  const params = uniqueQuery(url);
  let result: unknown;
  if (url.pathname === `${base}/entity`) {
    const ref = EntityQuery.parse(params);
    if (ref.kind !== state.entityKind || ref.id !== 'workspace-record' || ref.via !== undefined) throw new Error('Unexpected entity reference');
    result = entity(ref.kind);
  } else if (url.pathname === `${base}/records`) {
    const query = RecordsQuery.parse(params);
    if (query.filter.kind !== state.recordsKind || query.limit !== 50 ||
      (query.cursor !== undefined && query.cursor !== 'workspace-row-a')) throw new Error('Unexpected record subset or cursor');
    const expected = RecordsFilter.parse(state.recordsKind === 'gift-ledger'
      ? { kind: state.recordsKind, giftTypeId: 'workspace-gift', rehearsal: false } : { kind: state.recordsKind });
    const timed = RecordsFilter.safeParse({ ...expected, asOf: WORKSPACE_NOW });
    const expectedPageFilter = query.cursor && timed.success ? timed.data : expected;
    if (JSON.stringify(query.filter) !== JSON.stringify(expectedPageFilter)) throw new Error('Unexpected record filter values');
    result = records(query.filter, state, query.cursor);
  } else {
    const query = SearchQuery.parse(params);
    if (query.query !== 'Gallery' || query.limit !== 20) throw new Error('Unexpected search');
    result = SearchResponse.parse({ data: state.empty ? [] : [{ title: 'Synthetic Gallery', detail: 'Visible station reference', destination: { kind: 'station', id: 'workspace-record' } }],
      meta: { count: state.empty ? 0 : 1, truncated: false } });
  }
  await route.fulfill(state.status === 200 ? { json: result } : { status: state.status,
    json: { error: { code: state.status === 503 ? 'POLICY_UNAVAILABLE' : 'UNAVAILABLE', message: 'The selected read is unavailable.', requestId: 'workspace-browser-request' } } });
  return true;
}

/** Exact method, scoped path and parsed query; unexpected requests fail rather than returning empty data. */
export async function installWorkspaceFixture(page: Page, state = workspaceFixtureState()) {
  await page.clock.setFixedTime(new Date(WORKSPACE_NOW));
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    try {
      if (await baseResponse(route, url) || await workspaceResponse(route, url, state)) return;
    } catch (error) { state.unexpected.push(error instanceof Error ? error.message : 'Invalid fixture input'); }
    state.unexpected.push(`${route.request().method()} ${url.pathname}${url.search}`);
    await route.fulfill({ status: 500, json: { error: { code: 'UNEXPECTED_FIXTURE_REQUEST', message: 'Fixture request mismatch', requestId: 'strict-workspace-fixture' } } });
  });
  return state;
}
