import type { Router } from 'express';
import { EVENT_ROUTES, PLATFORM_ROUTES } from '../../src/app/routes.js';

/**
 * Every route the API serves, read from the routers themselves: its method and path, and the
 * names of the handlers it runs, in order (`named` gives each middleware a readable one).
 */

interface Layer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { name: string }[];
  };
}

export interface InventoryRoute {
  /** `GET /dashboard/live`: the method and the path under its module's mount. */
  readonly route: string;
  readonly chain: readonly string[];
}

export function routeInventory(): InventoryRoute[] {
  const routes: InventoryRoute[] = [];
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

/** The name an enforcement point was given: its action, or a request's composite name. */
export function askedOf(chain: readonly string[]): string | undefined {
  const point = chain.find((name) => name.startsWith('authorize('));
  return point?.slice('authorize('.length, -1);
}
