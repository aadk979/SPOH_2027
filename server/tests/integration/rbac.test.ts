import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CommitteeRole } from '@spoh/shared';
import { createApp } from '../../src/app.js';
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

/**
 * The capability matrix, proven through the HTTP surface (BUILD_PLAN §6.3).
 *
 * The unit test in tests/unit/capabilities.test.ts proves the table is right.
 * This proves the routes actually consult it — that every ❌ in the plan is a
 * 403 on the wire, not just a `false` in a lookup nobody calls.
 *
 * Every role here is rostered at the target station, so a denial can only come
 * from the capability layer and never from station scope.
 */

let app: Express;
let stationId: string;
const actors = new Map<CommitteeRole, TestVolunteer>();

const ROLES: CommitteeRole[] = [
  'VOLUNTEER',
  'IC',
  'DEPUTY_COORDINATOR',
  'CHIEF_COORDINATOR',
  'LEAD',
  'ADMIN',
];

beforeAll(async () => {
  await resetDatabase();
  app = createApp();

  const eventDay = await createEventDayToday();
  const station = await createStation({
    code: 'RBAC_STATION',
    name: 'RBAC Station',
    countsEntry: true,
    issuesStamp: true,
  });
  stationId = station.id;

  for (const role of ROLES) {
    const volunteer = await createVolunteer({
      email: `${role.toLowerCase()}@rbac.test`,
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
  /** Capability under test, for the test name. */
  capability: string;
  method: 'get' | 'post';
  path: string;
  body?: () => object;
  /** Roles the plan says may do this. Everyone else must get 403. */
  allowed: CommitteeRole[];
}

const PROBES: Probe[] = [
  {
    capability: 'registration.create',
    method: 'post',
    path: '/api/v1/registrations',
    body: () => ({ category: 'SEC_4', stationId, idempotencyKey: idempotencyKey() }),
    allowed: ['VOLUNTEER', 'IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'ADMIN'],
  },
  {
    capability: 'footfall.create',
    method: 'post',
    path: '/api/v1/footfall/ticks',
    body: () => ({ stationId, idempotencyKey: idempotencyKey() }),
    allowed: ['VOLUNTEER', 'IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'ADMIN'],
  },
  {
    capability: 'count.adjust',
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
    allowed: ['IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'ADMIN'],
  },
  {
    capability: 'incident.report',
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
    allowed: ['VOLUNTEER', 'IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD', 'ADMIN'],
  },
  {
    capability: 'lostPerson.raise',
    method: 'post',
    path: '/api/v1/lost-person',
    body: () => ({
      descriptionText: 'Child separated from their group near the lounge.',
      idempotencyKey: idempotencyKey(),
    }),
    allowed: ['VOLUNTEER', 'IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD', 'ADMIN'],
  },
  {
    capability: 'dashboard.station.read',
    method: 'get',
    path: '/api/v1/registrations/summary?groupBy=category',
    allowed: ['IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD', 'ADMIN'],
  },
  {
    capability: 'roster.edit',
    method: 'post',
    path: '/api/v1/roster/import',
    body: () => ({
      rows: [{ displayName: 'Preview Only', email: 'preview@rbac.test', role: 'VOLUNTEER' }],
      commit: false,
    }),
    allowed: ['DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'ADMIN'],
  },
  {
    capability: 'user.provision',
    method: 'post',
    path: '/api/v1/roster/volunteers',
    body: () => ({
      displayName: 'New Volunteer',
      email: `provisioned-${Math.random().toString(36).slice(2, 10)}@rbac.test`,
      role: 'VOLUNTEER',
    }),
    allowed: ['CHIEF_COORDINATOR', 'ADMIN'],
  },
  {
    capability: 'own.read',
    method: 'get',
    path: '/api/v1/me',
    allowed: ['VOLUNTEER', 'IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD', 'ADMIN'],
  },
];

describe('capability matrix over HTTP', () => {
  for (const probe of PROBES) {
    describe(probe.capability, () => {
      for (const role of ROLES) {
        const allowed = probe.allowed.includes(role);

        it(`${allowed ? 'allows' : 'denies (403)'} ${role}`, async () => {
          const actor = actors.get(role);
          expect(actor).toBeDefined();

          const call = request(app)[probe.method](probe.path).set('Authorization', bearer(actor!));
          const response = probe.body ? await call.send(probe.body()) : await call.send();

          if (allowed) {
            expect(response.status).toBeLessThan(400);
          } else {
            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('FORBIDDEN');
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
