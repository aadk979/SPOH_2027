// Shared P16 field bindings: HTTP outcomes, stored test SIDs and unchanged business state.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import * as contracts from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, createEventDayOn, testEvent } from '../helpers/fixtures.js';

type Mutation = { remove?: string; replace?: string; add?: string; value?: unknown };
type Binding = {
  method: 'POST' | 'PATCH';
  path: string;
  schemaName: keyof typeof contracts;
  id: string;
  mutation: Mutation;
};
type Case = Binding & { issues: { path: string; code: string }[] };
type SemanticCase = Binding & { expectedStatus: 200 | 201 | 400 | 404; expectedErrorCode?: string };
type Route = {
  method: 'POST' | 'PATCH';
  path: string;
  schemaName: keyof typeof contracts;
  base: Record<string, unknown>;
};
const corpus = JSON.parse(
  readFileSync(new URL('../fixtures/p16-structure-body-cases.json', import.meta.url), 'utf8'),
) as {
  formatVersion: number;
  phase: string;
  cases: Case[];
  routes: Route[];
  semanticCases: SemanticCase[];
};
const app = createApp();
let eventId: string;
let accessToken: string;
let personId: string;
let stationId: string;
let shiftId: string;
let targetIds: Record<string, string>;

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
  const type = await rawDb.stationType.create({
    data: { eventId, code: 'P16_TYPE', label: 'Original type', sortOrder: 10 },
  });
  const tag = await rawDb.stationTag.create({
    data: { eventId, code: 'P16_TAG', label: 'Original tag', description: 'Original scope' },
  });
  const category = await rawDb.captureCategory.create({
    data: { eventId, code: 'P16_CATEGORY', label: 'Original category', sortOrder: 10 },
  });
  const template = await rawDb.shiftTemplate.create({
    data: {
      eventId,
      code: 'P16_SHIFT',
      label: 'Original shift',
      startLocal: '00:00',
      endLocal: '12:00',
      sortOrder: 10,
    },
  });
  const day = await createEventDayOn('2026-10-14', 'Synthetic structure case day');
  const shift = await rawDb.shift.findFirstOrThrow({
    where: { eventId, eventDayId: day.id, templateId: template.id },
  });
  shiftId = shift.id;
  const station = await rawDb.station.create({
    data: {
      eventId,
      typeId: type.id,
      code: 'P16_EXISTING',
      name: 'Original station',
      floor: 'Original floor',
      sortOrder: 10,
    },
  });
  stationId = station.id;
  targetIds = {
    '/admin/structure/types/:id': type.id,
    '/admin/structure/tags/:id': tag.id,
    '/admin/structure/categories/:id': category.id,
    '/admin/structure/templates/:id': template.id,
    '/admin/stations/:id': station.id,
  };
  const person = await createVolunteer({
    email: 'synthetic-p16-structure@example.test',
    role: 'ADMIN',
    displayName: 'Synthetic structure administrator',
  });
  personId = person.id;
  // CI's declared local provider opens an actual stored SID. No staging authentication claim.
  const opened = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken: person.token })
    .expect(201);
  expect(opened.body.mfaRequired ?? false).toBe(false);
  expect(opened.body.volunteer.id).toBe(personId);
  accessToken = opened.body.accessToken as string;
});

function bodyFor(item: Binding): Record<string, unknown> {
  const route = corpus.routes.find((row) => row.method === item.method && row.path === item.path);
  if (!route) throw new Error('A case must have an explicit reviewed baseline');
  const body = { ...route.base };
  // Positive POST cases need distinct new codes; existing references stay bound to fixtures.
  if (item.method === 'POST' && 'code' in body)
    body.code = 'P16_CREATED_' + item.path.split('/').at(-1)!.toUpperCase();
  if ('idempotencyKey' in body) body.idempotencyKey = randomUUID();
  if (item.path === '/admin/assignments')
    Object.assign(body, { volunteerId: personId, stationId, shiftId });
  if (item.mutation.remove) delete body[item.mutation.remove];
  if (item.mutation.replace) body[item.mutation.replace] = item.mutation.value;
  if (item.mutation.add) body[item.mutation.add] = item.mutation.value;
  return body;
}

async function businessState() {
  const where = { eventId };
  return {
    event: await rawDb.event.findUniqueOrThrow({ where: { id: eventId } }),
    types: await rawDb.stationType.findMany({ where, orderBy: { id: 'asc' } }),
    tags: await rawDb.stationTag.findMany({ where, orderBy: { id: 'asc' } }),
    categories: await rawDb.captureCategory.findMany({ where, orderBy: { id: 'asc' } }),
    templates: await rawDb.shiftTemplate.findMany({ where, orderBy: { id: 'asc' } }),
    days: await rawDb.eventDay.findMany({ where, orderBy: { id: 'asc' } }),
    shifts: await rawDb.shift.findMany({ where, orderBy: { id: 'asc' } }),
    stations: await rawDb.station.findMany({ where, orderBy: { id: 'asc' } }),
    taggings: await rawDb.stationTagging.findMany({
      where,
      orderBy: [{ stationId: 'asc' }, { tagId: 'asc' }],
    }),
    assignments: await rawDb.shiftAssignment.findMany({ where, orderBy: { id: 'asc' } }),
    receipts: await rawDb.idempotencyRecord.findMany({ orderBy: { key: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
  };
}

it('retains every reviewed field binding and its explicit semantic HTTP outcome', () => {
  expect(corpus.formatVersion).toBe(1);
  expect(corpus.phase).toBe('DRAFT');
  expect(corpus.routes).toHaveLength(11);
  expect(corpus.cases).toHaveLength(278);
  expect(corpus.semanticCases).toHaveLength(52);
  expect(new Set(corpus.cases.map((row) => `${row.method} ${row.path} ${row.id}`)).size).toBe(278);
  expect(
    new Set(corpus.semanticCases.map((row) => `${row.method} ${row.path} ${row.id}`)).size,
  ).toBe(52);
  for (const item of corpus.semanticCases) {
    expect([200, 201, 400, 404]).toContain(item.expectedStatus);
    if (item.expectedStatus >= 400) expect(item.expectedErrorCode).toBeTruthy();
    else expect(item.expectedErrorCode).toBeUndefined();
  }
});

for (const kind of ['scoped', 'alias'] as const)
  it.each(corpus.cases)(
    `${kind} $method $path refuses $id without a business or receipt effect`,
    async (item) => {
      const body = bodyFor(item);
      const contract = contracts[item.schemaName] as {
        safeParse: (value: unknown) => { success: boolean };
      };
      expect(contract.safeParse(body).success).toBe(false);
      const relative = item.path.replace(':id', targetIds[item.path] ?? 'unbound-target');
      expect(relative).not.toContain('unbound-target');
      const endpoint =
        kind === 'scoped' ? `/api/v1/events/${eventId}${relative}` : `/api/v1${relative}`;
      const before = await businessState();
      const response = await request(app)
        [item.method === 'POST' ? 'post' : 'patch'](endpoint)
        .set('Origin', 'http://localhost:3000')
        .set('Authorization', 'Bearer ' + accessToken)
        .send(body)
        .expect(400);
      contracts.ErrorBody.parse(response.body);
      expect(response.body.error.code).toBe(contracts.ERROR_CODES.VALIDATION_FAILED);
      expect(
        response.body.error.details.issues.map((issue: { path: string; code: string }) => ({
          path: issue.path,
          code: issue.code,
        })),
      ).toEqual(item.issues);
      expect(await businessState()).toEqual(before);
    },
  );

const responses = {
  '/admin/structure/types': { key: 'data', schema: contracts.ManagedStationType },
  '/admin/structure/tags': { key: 'data', schema: contracts.ManagedStationTag },
  '/admin/structure/categories': { key: 'data', schema: contracts.CategoryActivityRecord },
  '/admin/structure/templates': { key: 'data', schema: contracts.ManagedShiftTemplate },
  '/admin/stations': { key: 'station', schema: contracts.StationSummary },
  '/admin/assignments': { key: 'assignment', schema: contracts.ShiftAssignmentRecord },
};
for (const kind of ['scoped', 'alias'] as const)
  it.each(corpus.semanticCases)(
    `${kind} $method $path gives the explicit HTTP outcome for schema-accepted $id`,
    async (item) => {
      const body = bodyFor(item);
      const contract = contracts[item.schemaName] as {
        parse: (value: unknown) => Record<string, unknown>;
      };
      const parsed = contract.parse(body);
      const relative = item.path.replace(':id', targetIds[item.path] ?? 'unbound-target');
      expect(relative).not.toContain('unbound-target');
      const endpoint =
        kind === 'scoped' ? `/api/v1/events/${eventId}${relative}` : `/api/v1${relative}`;
      const before = await businessState();
      const response = await request(app)
        [item.method === 'POST' ? 'post' : 'patch'](endpoint)
        .set('Origin', 'http://localhost:3000')
        .set('Authorization', 'Bearer ' + accessToken)
        .send(body)
        .expect(item.expectedStatus);
      if (item.expectedStatus >= 400) {
        contracts.ErrorBody.parse(response.body);
        expect(response.body.error.code).toBe(item.expectedErrorCode);
        expect(await businessState()).toEqual(before);
        return;
      }
      const definition = responses[item.path.replace('/:id', '') as keyof typeof responses];
      const actual = definition.schema.parse(response.body[definition.key]);
      expect(actual.id).toBeTruthy();
      if (item.path === '/admin/assignments') {
        expect(actual).toMatchObject({
          volunteerId: personId,
          stationId,
          roleLabel: parsed.roleLabel,
        });
        expect((actual as contracts.ShiftAssignmentRecord).shift.id).toBe(shiftId);
        expect(
          await rawDb.shiftAssignment.findUniqueOrThrow({ where: { id: actual.id } }),
        ).toMatchObject({ volunteerId: personId, stationId, shiftId });
      } else {
        const direct = Object.fromEntries(
          Object.entries(parsed).filter(
            ([field]) => !['idempotencyKey', 'typeCode', 'tagCodes'].includes(field),
          ),
        );
        expect(actual).toMatchObject(direct);
        if (
          item.method === 'PATCH' &&
          item.mutation.remove &&
          item.mutation.remove !== 'idempotencyKey'
        ) {
          const field = item.mutation.remove;
          const source = item.path.includes('/types/')
            ? before.types
            : item.path.includes('/tags/')
              ? before.tags
              : item.path.includes('/categories/')
                ? before.categories
                : item.path.includes('/templates/')
                  ? before.templates
                  : before.stations;
          const original = source.find((row) => row.id === targetIds[item.path])!;
          if (!['tagCodes', 'typeCode'].includes(field))
            expect(actual).toHaveProperty(field, original[field as keyof typeof original]);
        }
        if (item.path.startsWith('/admin/stations')) {
          const station = actual as contracts.StationSummary;
          expect(station.type.code).toBe('P16_TYPE');
          expect(station.tags.map((tag) => tag.code)).toEqual(parsed.tagCodes ?? []);
        }
      }
      expect(await rawDb.auditLog.count()).toBeGreaterThan(before.audits.length);
    },
  );
