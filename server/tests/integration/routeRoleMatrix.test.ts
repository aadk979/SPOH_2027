import { readFileSync, writeFileSync } from 'node:fs';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ACTION_CATALOGUE,
  ACTION_IDS,
  EDITABLE_ACTION_IDS,
  ROLE_IDS,
  type Action,
  type Role,
} from '@spoh/access-policies';
import { readDefaultGrants } from '@spoh/access-policies/default-grants';
import { createApp } from '../../src/app/createApp.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { askedOf, routeInventory } from '../helpers/routeInventory.js';

/**
 * The route × role matrix (P11.5), generated from the route inventory and the policies' grant
 * layer, replacing the hand-written capability matrix test (`rbac.test.ts`).
 *
 * For every route: what it asks, and who a new event lets do it before any resource is looked
 * at — the roles granted the action by `default-grants.json`, every member for self-service,
 * platform admins for the locked actions. Station, ownership, rank and the event's phase then
 * narrow it per request (the policies, and their own tests). The matrix is committed beside
 * this file; a change to a route, an action or a default grant changes it, and the diff is
 * the review. `UPDATE_ROUTE_MATRIX=1` rewrites it.
 *
 * The HTTP probes then prove the routes enforce it: every role is rostered at the station, so
 * a refusal can only be the grant.
 */

type Who = readonly Role[] | 'every member' | 'platform admins' | 'decided per request';

interface Entry {
  readonly asks: string;
  readonly who: Who;
}

const MATRIX_FILE = new URL('./route-role-matrix.json', import.meta.url);
const GRANTS = readDefaultGrants();

function whoMay(asked: string): Who {
  if (!(ACTION_IDS as readonly string[]).includes(asked)) return 'decided per request';
  const action = asked as Action;
  const groups = ACTION_CATALOGUE[action].groups as readonly string[];
  if ((EDITABLE_ACTION_IDS as readonly string[]).includes(action)) {
    return ROLE_IDS.filter((role) => GRANTS[role].grants.includes(action));
  }
  if (groups.includes('Self')) return 'every member';
  return 'platform admins';
}

function matrix(): Record<string, Entry> {
  const rows: [string, Entry][] = [];
  for (const { route, chain } of routeInventory()) {
    const asked = askedOf(chain);
    if (asked) rows.push([route, { asks: asked, who: whoMay(asked) }]);
  }
  return Object.fromEntries(rows.sort(([a], [b]) => a.localeCompare(b)));
}

describe('the route × role matrix', () => {
  const generated = matrix();

  it('matches the reviewed matrix', () => {
    const text = `${JSON.stringify(generated, null, 2)}\n`;
    if (process.env.UPDATE_ROUTE_MATRIX === '1') writeFileSync(MATRIX_FILE, text);
    expect(JSON.parse(readFileSync(MATRIX_FILE, 'utf8'))).toEqual(generated);
  });

  it('asks a known action, or names the request that asks several', () => {
    const unknown = Object.entries(generated)
      .filter(([, entry]) => entry.who === 'decided per request')
      .map(([route, entry]) => `${route} → ${entry.asks}`);
    // Composite questions: a setting by its class, an announcement by its target, a lifecycle
    // transition by its target.
    for (const line of unknown) {
      expect(line).toMatch(/→ (Settings|Announcement\.Send|Event\.Transition)$/);
    }
  });
});

let app: Express;
let stationId: string;
const actors = new Map<Role, TestVolunteer>();

beforeAll(async () => {
  await resetDatabase();
  app = createApp();
  const eventDay = await createEventDayToday();
  const station = await createStation({
    code: 'MATRIX_STATION',
    name: 'Matrix Station',
    countsEntry: true,
    issuesStamp: true,
  });
  stationId = station.id;
  for (const role of ROLE_IDS) {
    const volunteer = await createVolunteer({
      email: `${role.toLowerCase()}@matrix.test`,
      role,
      displayName: `${role} tester`,
    });
    await assignToStationAllBlocks({
      volunteerId: volunteer.id,
      stationId,
      eventDayId: eventDay.id,
    });
    actors.set(role, volunteer);
  }
});

interface Probe {
  /** The route as the matrix names it. */
  readonly route: string;
  readonly method: 'get' | 'post';
  readonly path: string;
  readonly body?: () => object;
}

const PROBES: readonly Probe[] = [
  {
    route: 'POST /registrations',
    method: 'post',
    path: '/api/v1/registrations',
    body: () => ({ category: 'SEC_4', stationId, idempotencyKey: idempotencyKey() }),
  },
  {
    route: 'POST /footfall/ticks',
    method: 'post',
    path: '/api/v1/footfall/ticks',
    body: () => ({ stationId, idempotencyKey: idempotencyKey() }),
  },
  {
    route: 'POST /footfall/bulk',
    method: 'post',
    path: '/api/v1/footfall/bulk',
    body: () => ({
      stationId,
      quantity: 12,
      timeBlockStart: new Date().toISOString(),
      source: 'PAPER',
      reason: 'clicker total at end of shift',
      idempotencyKey: idempotencyKey(),
    }),
  },
  {
    route: 'POST /incidents',
    method: 'post',
    path: '/api/v1/incidents',
    body: () => ({
      type: 'NEAR_MISS',
      severity: 'LOW',
      stationId,
      description: 'A cable was taped down after a trip hazard was noticed.',
      occurredAt: new Date().toISOString(),
      idempotencyKey: idempotencyKey(),
    }),
  },
  {
    route: 'POST /lost-person',
    method: 'post',
    path: '/api/v1/lost-person',
    body: () => ({
      descriptionText: 'Child separated from their group near the lounge.',
      idempotencyKey: idempotencyKey(),
    }),
  },
  {
    route: 'GET /registrations/summary',
    method: 'get',
    path: '/api/v1/registrations/summary?groupBy=category',
  },
  {
    route: 'POST /roster/import',
    method: 'post',
    path: '/api/v1/roster/import',
    body: () => ({
      rows: [{ displayName: 'Preview Only', email: 'preview@matrix.test', role: 'VOLUNTEER' }],
      commit: false,
    }),
  },
  {
    route: 'POST /roster/volunteers',
    method: 'post',
    path: '/api/v1/roster/volunteers',
    body: () => ({
      displayName: 'New Volunteer',
      email: `provisioned-${Math.random().toString(36).slice(2, 10)}@matrix.test`,
      role: 'VOLUNTEER',
    }),
  },
  { route: 'GET /me', method: 'get', path: '/api/v1/me' },
];

describe('the matrix over HTTP', () => {
  const generated = matrix();
  for (const probe of PROBES) {
    const entry = generated[probe.route];
    describe(`${probe.route} (${entry?.asks ?? 'missing'})`, () => {
      it('is in the matrix', () => {
        expect(entry).toBeDefined();
      });
      for (const role of ROLE_IDS) {
        const who = entry?.who;
        const allowed = who === 'every member' || (Array.isArray(who) && who.includes(role));
        it(`${allowed ? 'allows' : 'refuses (403)'} ${role}`, async () => {
          const actor = actors.get(role)!;
          const call = request(app)[probe.method](probe.path).set('Authorization', bearer(actor));
          const response = probe.body ? await call.send(probe.body()) : await call.send();
          if (allowed) {
            expect(response.status).toBeLessThan(400);
          } else {
            expect(response.status).toBe(403);
            // Granting your own rank is refused as an escalation even where the grant is missing.
            expect(['FORBIDDEN', 'ROLE_ESCALATION_DENIED']).toContain(response.body.error.code);
          }
        });
      }
    });
  }
});

describe('default deny', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await request(app).get('/api/v1/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a malformed bearer token', async () => {
    const response = await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(response.status).toBe(401);
  });

  it('never echoes the token or the verification error', async () => {
    const response = await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer leaky.token.value');
    expect(JSON.stringify(response.body)).not.toContain('leaky.token.value');
    expect(response.body.error.message).toBe('Authentication required');
  });

  it('leaves /healthz and /readyz open', async () => {
    expect((await request(app).get('/healthz')).status).toBe(200);
    expect((await request(app).get('/readyz')).status).toBe(200);
  });
});
