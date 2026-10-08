import type { Router } from 'express';
import { describe, expect, it } from 'vitest';
import { EVENT_ROUTES, PLATFORM_ROUTES } from '../../src/app/routes.js';

/**
 * Every route asks the Cedar policies (P11.5, ADR-005 §6). The inventory is read from the
 * routers themselves, so a route added without an `authorize` enforcement point fails here.
 * The only routes without one run before there is a membership to ask about: opening and
 * closing a session, the sign-in handoff, the public client configuration, the dev sign-in
 * and the person's own list of events.
 */

interface Layer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { name: string }[];
  };
}

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

function inventory(): { route: string; chain: string[] }[] {
  const routes = [];
  for (const { path, router } of [...PLATFORM_ROUTES, ...EVENT_ROUTES]) {
    for (const layer of (router as Router & { stack: Layer[] }).stack) {
      if (!layer.route) continue;
      const sub = layer.route.path === '/' ? '' : layer.route.path;
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({
          route: `${method.toUpperCase()} ${path}${sub}`,
          chain: layer.route.stack.map((entry) => entry.name),
        });
      }
    }
  }
  return routes;
}

describe('authorization coverage', () => {
  const routes = inventory();

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

  it('asks before the legacy guards, so shadow sees every request they refuse', () => {
    const late = routes
      .filter(({ chain }) => {
        const asked = chain.findIndex((name) => name.startsWith('authorize('));
        const guarded = chain.findIndex((name) => LEGACY_GUARD.test(name));
        return guarded >= 0 && asked > guarded;
      })
      .map(({ route }) => route);
    expect(late).toEqual([]);
  });

  it('lists only routes that exist as running without a membership', () => {
    const names = new Set(routes.map(({ route }) => route));
    expect([...WITHOUT_MEMBERSHIP].filter((route) => !names.has(route))).toEqual([]);
  });
});
