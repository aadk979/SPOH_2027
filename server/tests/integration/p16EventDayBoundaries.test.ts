import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import * as contracts from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  createVolunteer,
  createEventDayOn,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

type Binding = {
  id: string;
  form: string;
  method: 'POST' | 'PATCH';
  path: string;
  kind: string;
  expectedStatus: number;
  errorCode?: string;
  body?: { startLocal: string; endLocal: string };
};
const corpus = JSON.parse(
  readFileSync(new URL('../fixtures/p16-event-day-boundary-cases.json', import.meta.url), 'utf8'),
) as {
  formatVersion: number;
  cases: Binding[];
  receiptCases: number;
  domainHourCases: number;
};
const app = createApp();
let eventId: string,
  foreignId: string,
  dayId: string,
  otherDayId: string,
  foreignDayId: string,
  templateId: string,
  otherTemplateId: string,
  foreignTemplateId: string,
  token: string,
  chiefToken: string;
async function open(person: TestVolunteer) {
  const response = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken: person.token })
    .expect(201);
  expect(response.body.mfaRequired ?? false).toBe(false);
  return response.body.accessToken as string;
}
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  const home = await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
  dayId = (await createEventDayOn('2026-10-15', 'Original current day')).id;
  otherDayId = (await createEventDayOn('2026-10-16', 'Other owned day')).id;
  templateId = (await rawDb.shiftTemplate.findFirstOrThrow({ where: { eventId, code: 'MORNING' } }))
    .id;
  otherTemplateId = (
    await rawDb.shiftTemplate.findFirstOrThrow({ where: { eventId, code: 'AFTERNOON' } })
  ).id;
  const foreign = await createEvent({
    organisationId: home.organisationId,
    slug: 'synthetic-boundary-foreign',
    name: 'Foreign receipt scope',
    timezone: home.timezone,
    status: 'DRAFT',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  foreignId = foreign.id;
  await rawDb.event.update({
    where: { id: foreignId },
    data: { createdAt: new Date(home.createdAt.getTime() + 1000) },
  });
  foreignDayId = (
    await rawDb.eventDay.create({
      data: { eventId: foreignId, date: new Date('2026-10-15T00:00:00Z'), label: 'Foreign day' },
    })
  ).id;
  foreignTemplateId = (
    await rawDb.shiftTemplate.create({
      data: {
        eventId: foreignId,
        code: 'FOREIGN',
        label: 'Foreign hours',
        startLocal: '00:00',
        endLocal: '12:00',
      },
    })
  ).id;
  const admin = await createVolunteer({
    email: 'p16-boundaries-admin@example.test',
    role: 'ADMIN',
  });
  await rawDb.eventMembership.create({
    data: { eventId: foreignId, personId: admin.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  token = await open(admin);
  chiefToken = await open(
    await createVolunteer({
      email: 'p16-boundaries-chief@example.test',
      role: 'CHIEF_COORDINATOR',
    }),
  );
});
const prefix = (form: string) => (form === 'scoped' ? `/api/v1/events/${eventId}` : '/api/v1');
function call(method: 'POST' | 'PATCH', path: string, body: object, credential = token) {
  return request(app)
    [method === 'POST' ? 'post' : 'patch'](path)
    .set('Authorization', 'Bearer ' + credential)
    .send(body);
}
async function state() {
  return {
    events: await rawDb.event.findMany({ orderBy: { id: 'asc' } }),
    days: await rawDb.eventDay.findMany({ orderBy: { id: 'asc' } }),
    templates: await rawDb.shiftTemplate.findMany({ orderBy: { id: 'asc' } }),
    shifts: await rawDb.shift.findMany({ orderBy: { id: 'asc' } }),
    receipts: await rawDb.idempotencyRecord.findMany({ orderBy: { key: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
  };
}
it('retains all 22 receipt-scope and four schema-accepted invalid-hour bindings', () => {
  expect(corpus.formatVersion).toBe(1);
  expect(corpus.receiptCases).toBe(22);
  expect(corpus.domainHourCases).toBe(4);
  expect(corpus.cases).toHaveLength(26);
  expect(new Set(corpus.cases.map((row) => row.id)).size).toBe(26);
});
it.each(corpus.cases)(
  '$id enforces the exact receipt or domain outcome and no unintended effect',
  async (item) => {
    const template = item.path.includes('shift-templates'),
      target = template ? templateId : dayId;
    const path = prefix(item.form) + item.path.replace(':id', target),
      key = randomUUID();
    const me = await request(app)
      .get(prefix(item.form) + '/me')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(contracts.MeResponse.parse(me.body).event.id).toBe(eventId);
    if (item.body) {
      const body = { ...item.body, idempotencyKey: key };
      contracts.UpdateShiftTemplateRequest.parse(body);
      const before = await state();
      const rejected = await call('PATCH', path, body).expect(400);
      expect(rejected.body.error.code).toBe(item.errorCode);
      await expect.poll(state).toEqual(before);
      const corrected = { label: 'Corrected owned intent', idempotencyKey: key };
      const accepted = await call('PATCH', path, corrected).expect(200);
      expect(contracts.ShiftTemplateRecord.parse(accepted.body.template)).toMatchObject({
        id: templateId,
        label: corrected.label,
      });
      const after = await state();
      expect(after.receipts).toHaveLength(before.receipts.length + 1);
      expect(after.audits).toHaveLength(before.audits.length + 1);
      const replay = await call('PATCH', path, corrected).expect(200);
      expect(replay.body).toEqual(accepted.body);
      expect(await state()).toEqual(after);
      return;
    }
    const body = {
      label: 'Synthetic receipt boundary',
      ...(item.method === 'POST' ? { date: '2026-10-17' } : {}),
      idempotencyKey: key,
    };
    const initial = await call(item.method, path, body).expect(item.method === 'POST' ? 201 : 200);
    const after = await state();
    let destination = path,
      credential = token;
    if (item.kind === 'other-route-form-replay')
      destination =
        prefix(item.form === 'scoped' ? 'alias' : 'scoped') + item.path.replace(':id', target);
    if (item.kind === 'other-actor-reuse') credential = chiefToken;
    if (item.kind === 'other-event-reuse')
      destination =
        `/api/v1/events/${foreignId}` +
        item.path.replace(':id', template ? foreignTemplateId : foreignDayId);
    if (item.kind === 'other-target-reuse')
      destination =
        prefix(item.form) + item.path.replace(':id', template ? otherTemplateId : otherDayId);
    if (item.kind === 'other-event-reuse') {
      // Prove this is an authorized other-event context, rather than a membership/policy refusal.
      const own = await request(app)
        .get(`/api/v1/events/${foreignId}/admin/structure`)
        .set('Authorization', 'Bearer ' + token)
        .expect(200);
      expect(contracts.StructureResponse.parse(own.body).data.eventId).toBe(foreignId);
    }
    const response = await call(item.method, destination, body, credential).expect(
      item.expectedStatus,
    );
    if (item.errorCode) {
      contracts.ErrorBody.parse(response.body);
      expect(response.body.error.code).toBe(item.errorCode);
      expect(response.body.error.details).toBeUndefined();
    } else expect(response.body).toEqual(initial.body);
    expect(await state()).toEqual(after);
  },
);
for (const form of ['scoped', 'alias'])
  it(`${form} legacy hour edits move following shifts, preserve an override, and restore the original projection`, async () => {
    const structurePath = `/api/v1/events/${eventId}/admin/structure`;
    const original = contracts.StructureResponse.parse(
      (
        await request(app)
          .get(structurePath)
          .set('Authorization', 'Bearer ' + token)
          .expect(200)
      ).body,
    );
    const current = original.data.shifts.find(
      (s) => s.eventDayId === dayId && s.templateId === templateId,
    )!;
    const following = original.data.shifts.find(
      (s) => s.eventDayId === otherDayId && s.templateId === templateId,
    )!;
    const template = original.data.templates.find((t) => t.id === templateId)!;
    const override = await call(
      'PATCH',
      `/api/v1/events/${eventId}/admin/structure/shifts/${current.id}`,
      {
        operation: 'override',
        startLocal: '10:00',
        endLocal: '13:00',
        endsNextDay: false,
        idempotencyKey: randomUUID(),
      },
    ).expect(200);
    expect(contracts.ShiftExceptionRecord.parse(override.body.data).overridden).toBe(true);
    const endpoint = prefix(form) + '/admin/shift-templates/' + templateId;
    const body = {
      label: 'Changed legacy hours',
      startLocal: '08:00',
      endLocal: '12:00',
      idempotencyKey: randomUUID(),
    };
    const changed = await call('PATCH', endpoint, body).expect(200);
    expect(contracts.ShiftTemplateRecord.parse(changed.body.template)).toMatchObject({
      id: templateId,
      startLocal: body.startLocal,
      endLocal: body.endLocal,
    });
    expect(await rawDb.shift.findUniqueOrThrow({ where: { id: current.id } })).toMatchObject({
      overridden: true,
      startsAt: contracts.wallTimeToInstant('2026-10-15', '10:00', original.data.timezone),
      endsAt: contracts.wallTimeToInstant('2026-10-15', '13:00', original.data.timezone),
    });
    expect(await rawDb.shift.findUniqueOrThrow({ where: { id: following.id } })).toMatchObject({
      overridden: false,
      startsAt: contracts.wallTimeToInstant('2026-10-16', body.startLocal, original.data.timezone),
      endsAt: contracts.wallTimeToInstant('2026-10-16', body.endLocal, original.data.timezone),
    });
    const after = await state();
    expect((await call('PATCH', endpoint, body).expect(200)).body).toEqual(changed.body);
    expect(await state()).toEqual(after);
    await call('PATCH', endpoint, {
      label: template.label,
      startLocal: template.startLocal,
      endLocal: template.endLocal,
      idempotencyKey: randomUUID(),
    }).expect(200);
    await call('PATCH', `/api/v1/events/${eventId}/admin/structure/shifts/${current.id}`, {
      operation: 'restore',
      idempotencyKey: randomUUID(),
    }).expect(200);
    const restored = contracts.StructureResponse.parse(
      (
        await request(app)
          .get(structurePath)
          .set('Authorization', 'Bearer ' + token)
          .expect(200)
      ).body,
    );
    expect(restored).toEqual(original);
  });
