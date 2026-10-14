import { readFileSync } from 'node:fs';
import request from 'supertest';
import { beforeAll, expect, it } from 'vitest';
import { ROLE_IDS, type Role } from '@spoh/access-policies';
import {
  collection,
  ERROR_CODES,
  ErrorBody,
  EventDayRecord,
  MeResponse,
  MyPermissionsResponse,
  StationSummary,
  VolunteerAdminRecord,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createEventDayToday, createVolunteer, testEvent } from '../helpers/fixtures.js';

const contracts = {
  MeResponse,
  MyPermissionsResponse,
  StationList: collection(StationSummary),
  EventDayList: collection(EventDayRecord),
  VolunteerList: collection(VolunteerAdminRecord),
};
interface ReadCase {
  path: string;
  action: string;
  response: keyof typeof contracts;
  allowedRoles: Role[];
}
interface QueryCase {
  id: string;
  entries: [string, string][];
  contractIssues: { path: string; code: string }[];
}
const corpus = JSON.parse(
  readFileSync(new URL('../fixtures/p16-core-read-cases.json', import.meta.url), 'utf8'),
) as {
  formatVersion: number;
  phase: string;
  cases: ReadCase[];
  queryCases: QueryCase[];
};
const matrix = JSON.parse(
  readFileSync(new URL('./route-role-matrix.json', import.meta.url), 'utf8'),
) as Record<string, { asks: string; who: string | Role[] }>;
const app = createApp();
const actors = new Map<Role, { personId: string; accessToken: string }>();
let eventId: string;
beforeAll(async () => {
  await resetDatabase();
  const scope = await testEvent();
  eventId = scope.eventId;
  await createEventDayToday();
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
  for (const role of ROLE_IDS) {
    const person = await createVolunteer({
      email: `${role.toLowerCase()}@p16-core.test`,
      role,
      displayName: `Synthetic ${role}`,
    });
    // Verify the test-provider credential, then use a real stored API SID for every HTTP case.
    const opened = await request(app)
      .post('/api/v1/auth/session')
      .set('Origin', 'http://localhost:3000')
      .send({ providerAccessToken: person.token })
      .expect(201);
    expect(opened.body.mfaRequired ?? false).toBe(false);
    actors.set(role, { personId: person.id, accessToken: opened.body.accessToken as string });
  }
});
const pathFor = (kind: 'scoped' | 'alias', path: string) =>
  kind === 'scoped' ? `/api/v1/events/${eventId}${path}` : `/api/v1${path}`;
function checkAllowed(item: ReadCase, role: Role, body: request.Response['body']) {
  contracts[item.response].parse(body);
  if (item.response === 'MeResponse')
    expect(body).toMatchObject({
      volunteer: { id: actors.get(role)!.personId, role },
      event: { id: eventId, status: 'DRAFT' },
    });
  if (item.response === 'EventDayList') expect(body.data).toHaveLength(1);
  if (item.response === 'VolunteerList') {
    expect(body.data.map((row: { id: string }) => row.id).sort()).toEqual(
      [...actors.values()].map((a) => a.personId).sort(),
    );
    for (const [expectedRole, actor] of actors)
      expect(body.data.find((row: { id: string }) => row.id === actor.personId).role).toBe(
        expectedRole,
      );
    expect(body.meta).toEqual({ count: 6, nextCursor: null });
  }
}

it('pins the partial corpus to the committed route-role matrix without claiming uninventoried coverage', () => {
  expect(corpus.formatVersion).toBe(1);
  expect(corpus.phase).toBe('DRAFT');
  expect(corpus.cases).toHaveLength(5);
  expect(corpus.queryCases).toHaveLength(23);
  for (const item of corpus.cases) {
    const source = matrix['GET ' + item.path];
    if (!source)
      throw new Error(`The reviewed corpus route is missing from the matrix: ${item.path}`);
    expect(source.asks).toBe(item.action);
    expect(source.who === 'every member' ? [...ROLE_IDS] : source.who).toEqual(item.allowedRoles);
  }
});

for (const kind of ['scoped', 'alias'] as const)
  for (const item of corpus.cases) {
    for (const role of ROLE_IDS)
      it(`${kind} ${item.path} enforces its reviewed ${role} outcome with a stored SID`, async () => {
        const allowed = item.allowedRoles.includes(role);
        const response = await request(app)
          .get(pathFor(kind, item.path))
          .set('Authorization', 'Bearer ' + actors.get(role)!.accessToken)
          .expect(allowed ? 200 : 403);
        if (allowed) checkAllowed(item, role, response.body);
        else {
          ErrorBody.parse(response.body);
          expect(response.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
          expect(response.body.error.details.actions).toEqual([item.action]);
        }
      });
    it(`${kind} ${item.path} refuses missing and effectively forged credentials`, async () => {
      const endpoint = pathFor(kind, item.path);
      const missing = await request(app).get(endpoint).expect(401);
      expect(missing.body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
      const parts = actors.get('ADMIN')!.accessToken.split('.');
      const signature = Buffer.from(parts[2]!, 'base64url');
      signature[0]! ^= 1;
      const refused = await request(app)
        .get(endpoint)
        .set(
          'Authorization',
          'Bearer ' + parts.slice(0, 2).join('.') + '.' + signature.toString('base64url'),
        )
        .expect(401);
      expect(refused.body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    });
  }

for (const kind of ['scoped', 'alias'] as const)
  for (const item of corpus.queryCases) {
    it(`${kind} refuses ${item.id} with its reviewed roster query issues`, async () => {
      const response = await request(app)
        .get(pathFor(kind, '/admin/volunteers') + '?' + new URLSearchParams(item.entries))
        .set('Authorization', 'Bearer ' + actors.get('ADMIN')!.accessToken)
        .expect(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(
        response.body.error.details.issues.map((issue: { path: string; code: string }) => ({
          path: issue.path,
          code: issue.code,
        })),
      ).toEqual(item.contractIssues);
    });
  }
