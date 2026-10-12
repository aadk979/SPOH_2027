import { describe, expect, it } from 'vitest';
import { routeInventory } from '../helpers/routeInventory.js';

/**
 * Every route asks the Cedar policies, and they decide (P11.5, ADR-005 §6). The inventory is
 * read from the routers themselves, so a route added without an `authorize` enforcement point
 * fails here.
 * The only routes without one run before there is a membership to ask about: opening and
 * closing a session, the sign-in handoff, the public client configuration, the dev sign-in
 * and the person's own list of events.
 */

const WITHOUT_MEMBERSHIP = new Set([
  // ADR-001 approved publication exception; no unpublished or operational data.
  'GET /public/events/:slug/branding',
  'GET /public/events/:slug/branding/theme.css',
  'GET /public/events/:slug/branding/manifest.webmanifest',
  'GET /public/events/:slug/branding/assets/:publicationId/:variant',
  'POST /auth/session',
  'DELETE /auth/session',
  'POST /auth/refresh',
  'GET /auth/login',
  'GET /auth/callback',
  'GET /client-config',
  'POST /dev-auth/sign-in',
  'GET /events',
  'GET /auth/recover', // First-party refresh cookie plus PKCE-bound handoff; no event principal.
  'POST /auth/handoff', // One-use PKCE code, exact trusted origin; no event principal.
  'POST /auth/mfa/setup', // Restricted signed session; session-owned provider token only.
  'POST /auth/mfa/verify', // Restricted signed session and provider TOTP verification.
  'GET /auth/sessions', // requirePerson, own sessions only; valid with no Event-1 membership.
  'DELETE /auth/sessions/:id', // requirePerson plus loaded session's personId ownership.
]);

/** These cross-event platform use cases ask current Cedar authority in their transactions. */
const PLATFORM_USE_CASE_AUTHORITY = new Map([
  ['GET /notification-centre', 'requirePerson: own private centre; each source rechecks current event authority'],
  ['GET /notification-centre/:id', 'requirePerson: exact notice recipient; current scoped source visibility before projection'],
  ['PUT /notification-centre/:id/read', 'requirePerson: exact notice recipient and current source authority before read-state change'],
  ['GET /notification-centre/preferences', 'requirePerson: reads only the authenticated person preference row'],
  ['PUT /notification-centre/preferences', 'requirePerson: writes only the authenticated person preference row'],
  ['GET /notification-centre/device/config', 'requirePerson: public push configuration behind the person session'],
  ['POST /notification-centre/device/subscriptions', 'requirePerson: registers only the current authenticated person device'],
  ['DELETE /notification-centre/device/subscriptions', 'requirePerson: removes only subscriptions owned by the authenticated person'],
  ['GET /people/:id', 'permittedPerson: Platform.ManageAdmins for every target organisation'],
  ['GET /people/:id/data', 'permittedPerson: Platform.ManageAdmins for every target organisation'],
  ['POST /people/:id/erase', 'permittedPerson: Platform.ManageAdmins under the person lock'],
  ['POST /people/:id/deactivate', 'permittedPerson: Platform.ManageAdmins under the person lock'],
  ['POST /people/:id/reactivate', 'permittedPerson: Platform.ManageAdmins under the person lock'],
  [
    'GET /events/administration',
    'organisationAuthority: current create/clone policy filters output',
  ],
  ['POST /events', 'requireOrganisationAuthority: Platform.CreateEvent under organisation lock'],
  [
    'POST /events/clone',
    'requireOrganisationAuthority: Platform.CloneEvent under organisation lock',
  ],
]);

const LEGACY_GUARD = /^(requireCapability|requireStationScope)/;

describe('authorization coverage', () => {
  const routes = routeInventory();

  it('reads a full inventory', () => {
    expect(routes.length).toBeGreaterThan(140);
  });

  it('has a route enforcement point or documented current platform use-case authority', () => {
    const missing = routes
      .filter(({ route }) => !WITHOUT_MEMBERSHIP.has(route))
      .filter(({ route }) => !PLATFORM_USE_CASE_AUTHORITY.has(route))
      .filter(({ chain }) => !chain.some((name) => name.startsWith('authorize(')))
      .map(({ route }) => route);
    expect(missing).toEqual([]);
  });

  it('has no legacy guard left: the policies decide (P11.5 release 2)', () => {
    const legacy = routes
      .filter(({ chain }) => chain.some((name) => LEGACY_GUARD.test(name)))
      .map(({ route }) => route);
    expect(legacy).toEqual([]);
  });

  it('lists only routes that exist as running without a membership', () => {
    const names = new Set(routes.map(({ route }) => route));
    expect([...WITHOUT_MEMBERSHIP].filter((route) => !names.has(route))).toEqual([]);
    expect([...PLATFORM_USE_CASE_AUTHORITY.keys()].filter((route) => !names.has(route))).toEqual(
      [],
    );
    expect([...PLATFORM_USE_CASE_AUTHORITY.values()].every((reason) => reason.length > 30)).toBe(
      true,
    );
  });
});
