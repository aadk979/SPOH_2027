import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { clientCallInventory, callCoversRoute } from '../helpers/clientCallInventory.js';
import { routeInventory } from '../helpers/routeInventory.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const exceptions = new Map([
  [
    'GET /content/assets/:versionId/:image',
    'PublishedContentRecord supplies the version-owned image URL. features/content/api.ts getContentImage validates its anchored asset route and calls apiBlob; it is a runtime caller whose URL comes from the server.',
  ],
  [
    'GET /lifecycle',
    'Status-only read projection superseded in the workspace by GET /lifecycle/readiness, whose lifecycle field carries the identical versioned lifecycle response plus transition checks.',
  ],
  [
    'GET /roster/me',
    'Compatibility projection explicitly documented in roster/http/routes.ts as the same payload as GET /me, which the My shift screen consumes through session queries.',
  ],
  [
    'POST /gifts/:id/adjust',
    'Legacy no-key stock correction remains compatible. The Gifts and stock screen uses POST /gifts/:id/stock for the identical adjustStock use case with a mandatory durable receipt.',
  ],
  [
    'GET /announcements/drafts/:id',
    'Single-record projection of the same toDraftRecord used by the paginated own-draft list. PrivateDraftWorkspace reads the selected full record from that list, with identical ownership filtering.',
  ],
  [
    'GET /announcements/drafts/:id/schedules/:scheduleId',
    'Single-record projection of the own-draft schedule list. DraftSchedules reads and edits full schedule records from that paginated list, preserving owner filtering and reviewed versions.',
  ],
  [
    'GET /admin/volunteers/:id',
    'Single-person projection uses the same toAdminRecord and adminSelect as the People list. Its selected person editor already exposes that full event membership record and actions.',
  ],
  [
    'GET /auth/callback',
    'Cognito redirects the hosted sign-in browser here; only the identity provider calls this OAuth callback.',
  ],
  [
    'POST /dev-auth/sign-in',
    'Development-only compatibility session route; the client uses POST /auth/session. Never mounted in production.',
  ],
]);

describe('route-to-client inventory (P13.7)', () => {
  const routes = routeInventory();
  const calls = clientCallInventory(root);
  it('covers every real product route with a source-derived HTTP caller', () => {
    const missing = routes
      .filter(
        ({ route }) =>
          !exceptions.has(route) && !calls.some((call) => callCoversRoute(call, route)),
      )
      .map(({ route }) => route);
    expect(missing).toEqual([]);
  });
  it('has only current documented runtime callers, callbacks and redundant read projections', () => {
    expect(
      [...exceptions.keys()].filter((route) => !routes.some((entry) => entry.route === route)),
    ).toEqual([]);
    expect([...exceptions.values()].every((reason) => reason.length > 50)).toBe(true);
  });
  it('does not accept a changed method, a missing product path, or a transport-wide wildcard', () => {
    const example = { method: 'POST', path: '/cards/:dynamic/void', source: 'example.ts', line: 1 };
    expect(callCoversRoute(example, 'POST /cards/:code/void')).toBe(true);
    expect(callCoversRoute(example, 'DELETE /cards/:code/void')).toBe(false);
    expect(callCoversRoute(example, 'POST /cards/:code/reissue')).toBe(false);
    expect(callCoversRoute({ ...example, path: ':dynamic' }, 'POST /cards/:code/void')).toBe(false);
    expect(calls.length).toBeGreaterThan(100);
  });
});
