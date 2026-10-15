import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as contracts from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { settleDenials } from '../../src/platform/http/authorizationDenials.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  createVolunteer,
  createEventDayOn,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

type Route = {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  action: string;
  allowedRoles: contracts.CommitteeRole[];
  responseName?: string;
};
type Case = {
  id: string;
  route: Route;
  form: string;
  role?: contracts.CommitteeRole;
  kind:
    | 'role'
    | 'before-validation'
    | 'missing'
    | 'actual-expired'
    | 'forged-signature'
    | 'actual-foreign'
    | 'absent'
    | 'overlong-id';
  foreign?: boolean;
};
const corpus = JSON.parse(
  readFileSync(new URL('../fixtures/p16-event-day-route-cases.json', import.meta.url), 'utf8'),
) as {
  formatVersion: number;
  lifecycle: string;
  routes: Route[];
  forms: string[];
  roles: contracts.CommitteeRole[];
  authKinds: Case['kind'][];
  objectKinds: Case['kind'][];
  expectedCases: number;
  nonmemberOutcomes: Record<string, { status: number; errorCode: string }>;
};
const matrix = JSON.parse(
  readFileSync(new URL('./route-role-matrix.json', import.meta.url), 'utf8'),
) as Record<string, { asks: string; who: contracts.CommitteeRole[] }>;
const app = createApp(),
  cases: Case[] = [];
for (const form of corpus.forms)
  for (const route of corpus.routes) {
    for (const role of corpus.roles) {
      cases.push({
        id: `${form}:${role}:${route.method}:${route.path}`,
        route,
        form,
        role,
        kind: 'role',
      });
      if (route.method !== 'GET' && !route.allowedRoles.includes(role))
        cases.push({
          id: `${form}:${role}:${route.method}:${route.path}:before-validation`,
          route,
          form,
          role,
          kind: 'before-validation',
        });
    }
    cases.push({
      id: `${form}:FOREIGN:${route.method}:${route.path}`,
      route,
      form,
      role: 'VOLUNTEER',
      foreign: true,
      kind: 'role',
    });
    if (route.method !== 'GET')
      cases.push({
        id: `${form}:FOREIGN:${route.method}:${route.path}:before-validation`,
        route,
        form,
        role: 'VOLUNTEER',
        foreign: true,
        kind: 'before-validation',
      });
    for (const kind of corpus.authKinds)
      cases.push({ id: `${form}:${kind}:${route.method}:${route.path}`, route, form, kind });
    if (route.method === 'PATCH')
      for (const kind of corpus.objectKinds)
        cases.push({ id: `${form}:${kind}:${route.path}`, route, form, kind });
  }
let eventId: string,
  foreignEventId: string,
  dayId: string,
  templateId: string,
  foreignDayId: string,
  foreignTemplateId: string,
  admin: TestVolunteer,
  adminToken: string;
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
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  const home = await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
  dayId = (await createEventDayOn('2026-10-15', 'Synthetic original day')).id;
  templateId = (await rawDb.shiftTemplate.findFirstOrThrow({ where: { eventId, code: 'MORNING' } }))
    .id;
  const foreign = await rawDb.event.create({
    data: {
      organisationId: home.organisationId,
      slug: 'synthetic-foreign-days',
      name: 'Foreign synthetic event',
      timezone: home.timezone,
      // Database defaults use the real database clock; pin relative order in this frozen CI fixture.
      createdAt: new Date(home.createdAt.getTime() + 1000),
    },
  });
  foreignEventId = foreign.id;
  foreignDayId = (
    await rawDb.eventDay.create({
      data: {
        eventId: foreign.id,
        date: new Date('2026-10-15T00:00:00Z'),
        label: 'Foreign synthetic day',
      },
    })
  ).id;
  foreignTemplateId = (
    await rawDb.shiftTemplate.create({
      data: {
        eventId: foreign.id,
        code: 'FOREIGN',
        label: 'Foreign hours',
        startLocal: '00:00',
        endLocal: '12:00',
      },
    })
  ).id;
  admin = await createVolunteer({ email: 'p16-days-admin@example.test', role: 'ADMIN' });
  adminToken = await open(admin);
});
afterEach(() => vi.setSystemTime(FROZEN_NOW));
async function businessState() {
  return {
    events: await rawDb.event.findMany({ orderBy: { id: 'asc' } }),
    days: await rawDb.eventDay.findMany({ orderBy: { id: 'asc' } }),
    templates: await rawDb.shiftTemplate.findMany({ orderBy: { id: 'asc' } }),
    shifts: await rawDb.shift.findMany({ orderBy: { id: 'asc' } }),
    receipts: await rawDb.idempotencyRecord.findMany({ orderBy: { key: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
  };
}
const ownTarget = (route: Route) => (route.path.includes('shift-templates') ? templateId : dayId);
const foreignTarget = (route: Route) =>
  route.path.includes('shift-templates') ? foreignTemplateId : foreignDayId;
function bodyFor(route: Route, kind: Case['kind']) {
  if (route.method === 'GET') return undefined;
  if (kind === 'before-validation') return { unexpected: true };
  return {
    label: 'Synthetic allowed write',
    ...(route.method === 'POST' ? { date: '2026-10-16' } : {}),
    idempotencyKey: randomUUID(),
  };
}
it('pins the 142 DRAFT role/auth/object bindings to the committed permission matrix', () => {
  expect(corpus.formatVersion).toBe(1);
  expect(corpus.lifecycle).toBe('DRAFT');
  expect(cases).toHaveLength(142);
  expect(corpus.expectedCases).toBe(142);
  expect(new Set(cases.map((row) => row.id)).size).toBe(142);
  for (const route of corpus.routes)
    expect(matrix[route.method + ' ' + route.path]).toEqual({
      asks: route.action,
      who: route.allowedRoles,
    });
});
it.each(cases)(
  '$id enforces the bound outcome and business, audit and receipt effects',
  async (item) => {
    let accessToken: string | undefined = adminToken;
    let expectedActorId = admin.id;
    if (item.role && (item.role !== 'ADMIN' || item.foreign)) {
      const person = await createVolunteer({
        email: 'p16-days-member@example.test',
        role: item.role,
      });
      if (item.foreign)
        await rawDb.eventMembership.updateMany({
          where: { personId: person.id, eventId },
          data: { eventId: foreignEventId },
        });
      accessToken = await open(person);
      expectedActorId = person.id;
    }
    if (item.foreign) {
      const own = await request(app)
        .get(`/api/v1/events/${foreignEventId}/me`)
        .set('Authorization', 'Bearer ' + accessToken!)
        .expect(200);
      expect(contracts.MeResponse.parse(own.body)).toMatchObject({
        event: { id: foreignEventId },
        volunteer: { id: expectedActorId, role: 'VOLUNTEER' },
      });
    }
    if (item.kind === 'missing') accessToken = undefined;
    if (item.kind === 'forged-signature') {
      const parts = adminToken.split('.'),
        signature = Buffer.from(parts[2]!, 'base64url');
      signature[0] = signature[0]! ^ 1;
      accessToken = parts.slice(0, 2).join('.') + '.' + signature.toString('base64url');
    }
    if (item.kind === 'actual-expired') {
      // CI advances only its declared fixture Date; staging waits for real elapsed expiry.
      vi.setSystemTime(new Date(decodeJwt(adminToken).exp! * 1000 + 2000));
      const current = await createVolunteer({
        email: 'p16-days-current-admin@example.test',
        role: 'ADMIN',
      });
      adminToken = await open(current);
    }
    const route = item.route;
    const objectCase = ['actual-foreign', 'absent', 'overlong-id'].includes(item.kind);
    const target =
      item.kind === 'actual-foreign'
        ? foreignTarget(route)
        : item.kind === 'absent'
          ? 'absent-synthetic-object'
          : item.kind === 'overlong-id'
            ? 'x'.repeat(65)
            : ownTarget(route);
    const endpoint =
      (item.form === 'scoped' ? `/api/v1/events/${eventId}` : '/api/v1') +
      route.path.replace(':id', target);
    const authenticationRefusal = ['missing', 'actual-expired', 'forged-signature'].includes(
      item.kind,
    );
    const allowed = !item.foreign && (!item.role || route.allowedRoles.includes(item.role));
    const expected = authenticationRefusal
      ? 401
      : objectCase
        ? item.kind === 'overlong-id'
          ? 400
          : 404
        : item.foreign
          ? corpus.nonmemberOutcomes[item.form]!.status
          : !allowed
            ? 403
            : route.method === 'POST'
              ? 201
              : 200;
    if (item.form === 'alias') {
      const control = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer ' + adminToken)
        .expect(200);
      expect(contracts.MeResponse.parse(control.body).event.id).toBe(eventId);
    }
    const body = bodyFor(route, item.kind),
      before = await businessState();
    let pending =
      request(app)[route.method === 'GET' ? 'get' : route.method === 'POST' ? 'post' : 'patch'](
        endpoint,
      );
    if (accessToken) pending = pending.set('Authorization', 'Bearer ' + accessToken);
    const response = await pending.send(body).expect(expected);
    if (expected >= 400) {
      contracts.ErrorBody.parse(response.body);
      const code = item.foreign
        ? corpus.nonmemberOutcomes[item.form]!.errorCode
        : expected === 401
          ? contracts.ERROR_CODES.UNAUTHENTICATED
          : expected === 403
            ? contracts.ERROR_CODES.FORBIDDEN
            : expected === 404
              ? contracts.ERROR_CODES.NOT_FOUND
              : contracts.ERROR_CODES.VALIDATION_FAILED;
      expect(response.body.error.code).toBe(code);
      if (expected === 403 && !item.foreign)
        expect(response.body.error.details.actions).toEqual([route.action]);
      if (expected === 404 || item.foreign) expect(response.body.error.details).toBeUndefined();
      await settleDenials();
      const after = await businessState();
      if (expected === 403 && !item.foreign) {
        const oldIds = new Set(before.audits.map((row) => row.id));
        const added = after.audits.filter((row) => !oldIds.has(row.id));
        expect(added).toHaveLength(1);
        const pattern =
          (item.form === 'scoped' ? '/api/v1/events/:eventId' : '/api/v1') + route.path;
        expect(added[0]).toMatchObject({
          action: 'authorization.denied',
          actorId: expectedActorId,
          actorSub: decodeJwt(accessToken!).sub,
          eventId,
          entityType: 'Route',
          entityId: route.method + ' ' + pattern,
          path: pattern,
          method: route.method,
          statusCode: 403,
          outcome: 'DENIED',
          severity: 'WARNING',
          requestId: response.body.error.requestId,
          after: { actions: [route.action] },
        });
        expect({ ...after, audits: after.audits.filter((row) => oldIds.has(row.id)) }).toEqual(
          before,
        );
      } else expect(after).toEqual(before);
    } else if (route.method === 'GET') {
      const parsed =
        route.responseName === 'EventDayList'
          ? contracts.collection(contracts.EventDayRecord).parse(response.body)
          : contracts.collection(contracts.ShiftTemplateRecord).parse(response.body);
      expect(parsed.meta.nextCursor).toBe(null);
      expect(parsed.data.map((row) => row.id)).not.toContain(foreignTarget(route));
      expect(await businessState()).toEqual(before);
    } else {
      const template = route.path.includes('shift-templates');
      const actual = template
        ? contracts.ShiftTemplateRecord.parse(response.body.template)
        : contracts.EventDayRecord.parse(response.body.eventDay);
      if (!body || !('label' in body)) throw new Error('A successful write needs a reviewed label');
      expect(actual.label).toBe(body.label);
      if (route.method === 'POST')
        expect((actual as contracts.EventDayRecord).date).toBe('2026-10-16');
      else expect(actual.id).toBe(ownTarget(route));
      const after = await businessState();
      expect(after.audits).toHaveLength(before.audits.length + 1);
      expect(after.receipts).toHaveLength(before.receipts.length + 1);
      expect(after.days.find((row) => row.id === foreignDayId)).toEqual(
        before.days.find((row) => row.id === foreignDayId),
      );
      expect(after.templates.find((row) => row.id === foreignTemplateId)).toEqual(
        before.templates.find((row) => row.id === foreignTemplateId),
      );
    }
    if (authenticationRefusal) {
      const control = await request(app)
        .get(`/api/v1/events/${eventId}/me`)
        .set('Authorization', 'Bearer ' + adminToken)
        .expect(200);
      contracts.MeResponse.parse(control.body);
    }
  },
);
