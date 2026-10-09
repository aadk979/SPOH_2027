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
  'POST /auth/session',
  'DELETE /auth/session',
  'POST /auth/refresh',
  'GET /auth/login',
  'GET /auth/callback',
  'GET /client-config',
  'POST /dev-auth/sign-in',
  'GET /events',
]);

const LEGACY_GUARD = /^(requireCapability|requireStationScope)/;

describe('authorization coverage', () => {
  const routes = routeInventory();

  it('reads a full inventory', () => {
    expect(routes.length).toBeGreaterThan(140);
  });

  it('has an authorize enforcement point on every route that has a member', () => {
    const missing = routes
      .filter(({ route }) => !WITHOUT_MEMBERSHIP.has(route))
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
  });
});
