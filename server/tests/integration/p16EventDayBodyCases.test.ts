// The same reviewed bindings drive the real staging campaign; CI uses only spoh2027_test.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import * as contracts from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, createEventDayOn, testEvent } from '../helpers/fixtures.js';

type Route = {
  method: 'POST' | 'PATCH';
  path: string;
  schemaName: keyof typeof contracts;
  base: Record<string, unknown>;
};
type Binding = Omit<Route, 'base'> & {
  id: string;
  mutation?: { remove?: string; replace?: string; add?: string; value?: unknown };
  body?: Record<string, unknown>;
  issues?: { path: string; code: string }[];
  expectedStatus?: number;
};
const corpus = JSON.parse(
  readFileSync(new URL('../fixtures/p16-event-day-body-cases.json', import.meta.url), 'utf8'),
) as {
  formatVersion: number;
  routes: Route[];
  cases: Binding[];
  semanticCases: Binding[];
};
const app = createApp();
let eventId: string, token: string, dayId: string, templateId: string;

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
  const template = await rawDb.shiftTemplate.findFirstOrThrow({
    where: { eventId, code: 'MORNING' },
  });
  templateId = template.id;
  dayId = (await createEventDayOn('2026-10-15', 'Original synthetic day')).id;
  const person = await createVolunteer({ email: 'synthetic-p16-days@example.test', role: 'ADMIN' });
  const opened = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken: person.token })
    .expect(201);
  expect(opened.body.mfaRequired ?? false).toBe(false);
  token = opened.body.accessToken as string;
});

function bodyFor(item: Binding) {
  const route = corpus.routes.find((row) => row.method === item.method && row.path === item.path)!;
  const body: Record<string, unknown> = item.body ? { ...item.body } : { ...route.base };
  if ('date' in body) body.date = '2026-10-16'; // A new owned day, rather than the existing target.
  if ('idempotencyKey' in body) body.idempotencyKey = randomUUID();
  if (item.mutation?.remove) delete body[item.mutation.remove];
  if (item.mutation?.replace) body[item.mutation.replace] = item.mutation.value;
  if (item.mutation?.add) body[item.mutation.add] = item.mutation.value;
  return body;
}
function endpoint(item: Binding, form: string) {
  const target = item.path.includes('shift-templates') ? templateId : dayId;
  return (
    (form === 'scoped' ? `/api/v1/events/${eventId}` : '/api/v1') + item.path.replace(':id', target)
  );
}
function send(item: Binding, form: string, body: Record<string, unknown>) {
  return request(app)
    [item.method === 'POST' ? 'post' : 'patch'](endpoint(item, form))
    .set('Origin', 'http://localhost:3000')
    .set('Authorization', 'Bearer ' + token)
    .send(body);
}
async function state() {
  return {
    events: await rawDb.event.findMany({ orderBy: { id: 'asc' } }),
    days: await rawDb.eventDay.findMany({ orderBy: { id: 'asc' } }),
    templates: await rawDb.shiftTemplate.findMany({ orderBy: { id: 'asc' } }),
    shifts: await rawDb.shift.findMany({ orderBy: { id: 'asc' } }),
    assignments: await rawDb.shiftAssignment.findMany({ orderBy: { id: 'asc' } }),
    receipts: await rawDb.idempotencyRecord.findMany({ orderBy: { key: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
  };
}

it('retains every field binding, with distinct invalid and schema-accepted outcomes', () => {
  expect(corpus.formatVersion).toBe(1);
  expect(corpus.routes).toHaveLength(3);
  expect(corpus.cases).toHaveLength(109);
  expect(corpus.semanticCases).toHaveLength(24);
  const all = [...corpus.cases, ...corpus.semanticCases];
  expect(new Set(all.map((row) => `${row.method} ${row.path} ${row.id}`)).size).toBe(133);
  for (const route of corpus.routes)
    for (const field of Object.keys(route.base))
      expect(all.some((row) => row.path === route.path && row.id === field + ':omitted')).toBe(
        true,
      );
});

for (const form of ['scoped', 'alias']) {
  it.each(corpus.cases)(
    `${form} $method $path refuses $id without changing business data, audits or receipts`,
    async (item) => {
      const body = bodyFor(item);
      const contract = contracts[item.schemaName] as {
        safeParse: (body: unknown) => { success: boolean };
      };
      expect(contract.safeParse(body).success).toBe(false);
      const before = await state(),
        response = await send(item, form, body).expect(400);
      contracts.ErrorBody.parse(response.body);
      expect(response.body.error.code).toBe(contracts.ERROR_CODES.VALIDATION_FAILED);
      expect(
        response.body.error.details.issues.map((issue: { path: string; code: string }) => ({
          path: issue.path,
          code: issue.code,
        })),
      ).toEqual(item.issues);
      expect(await state()).toEqual(before);
    },
  );

  it.each(corpus.semanticCases)(
    `${form} $method $path persists schema-accepted $id and replays a supplied receipt once`,
    async (item) => {
      const body = bodyFor(item);
      const contract = contracts[item.schemaName] as {
        parse: (body: unknown) => Record<string, unknown>;
      };
      const parsed = contract.parse(body),
        before = await state();
      const response = await send(item, form, body).expect(item.expectedStatus!);
      const template = item.path.includes('shift-templates');
      const actual = template
        ? contracts.ShiftTemplateRecord.parse(response.body.template)
        : contracts.EventDayRecord.parse(response.body.eventDay);
      expect(actual).toMatchObject(
        Object.fromEntries(Object.entries(parsed).filter(([field]) => field !== 'idempotencyKey')),
      );
      const stored = template
        ? await rawDb.shiftTemplate.findUniqueOrThrow({ where: { id: actual.id } })
        : await rawDb.eventDay.findUniqueOrThrow({ where: { id: actual.id } });
      expect(stored).toMatchObject(
        Object.fromEntries(
          Object.entries(parsed).filter(([field]) => !['idempotencyKey', 'date'].includes(field)),
        ),
      );
      if (item.method === 'POST') {
        const day = actual as contracts.EventDayRecord;
        expect(day.date).toBe('2026-10-16');
        expect(day.shifts).toHaveLength(before.templates.filter((row) => row.active).length);
        expect(stored).toMatchObject({ date: new Date('2026-10-16T00:00:00.000Z') });
      } else if (item.mutation?.remove && item.mutation.remove !== 'idempotencyKey') {
        const original = template
          ? before.templates.find((row) => row.id === templateId)!
          : before.days.find((row) => row.id === dayId)!;
        expect(actual).toHaveProperty(
          item.mutation.remove,
          original[item.mutation.remove as keyof typeof original],
        );
      }
      const after = await state();
      expect(after.audits).toHaveLength(before.audits.length + 1);
      expect(after.receipts).toHaveLength(before.receipts.length + (body.idempotencyKey ? 1 : 0));
      if (body.idempotencyKey) {
        const replay = await send(item, form, body).expect(item.expectedStatus!);
        expect(replay.body).toEqual(response.body);
        expect(await state()).toEqual(after);
        const changed = await send(item, form, { ...body, label: 'Changed receipt intent' }).expect(
          409,
        );
        expect(changed.body.error.code).toBe(contracts.ERROR_CODES.IDEMPOTENCY_KEY_REUSE);
        expect(await state()).toEqual(after);
      }
    },
  );
}
