import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decodeJwt } from 'jose';
import type { z } from 'zod';
import * as contracts from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { settleDenials } from '../../src/platform/http/authorizationDenials.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, makePlatformAdmin, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
type Body = Record<string, Value>;
type Variant = {
  variant: string;
  method: 'POST' | 'PATCH' | 'PUT';
  path: string;
  schema: string;
  base: Body;
};
type Binding = {
  variant: string;
  id: string;
  category: string;
  mutation?: { path: string; remove?: boolean; value?: Value };
  replaceBody?: Body;
  expectedIssues: { path: string; code: string }[];
};
type PreparedCorpus = {
  formatVersion: number;
  phase: string;
  variants: Variant[];
  invalid: Binding[];
};
const corpus = JSON.parse(
  readFileSync(
    new URL('../fixtures/p16-visitor-permissions-body-cases.json', import.meta.url),
    'utf8',
  ),
) as PreparedCorpus;
const app = createApp();
let eventId: string, personId: string, fieldId: string, token: string;
const schema = (name: string) => (contracts as unknown as Record<string, z.ZodType<Body>>)[name]!;
const scoped = (path: string) => '/api/v1/events/' + eventId + path;
function object(value: Value | undefined): Body {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an explicit object binding');
  return value;
}
function bind(variant: Variant, item: Binding): Body {
  if (item.replaceBody) return structuredClone(item.replaceBody);
  const body = structuredClone(variant.base);
  if ('idempotencyKey' in body) body.idempotencyKey = randomUUID();
  if (body.personId === 'OWN_PERSON') body.personId = personId;
  if (body.resource) object(body.resource).id = eventId;
  const mutation = item.mutation!;
  const parts = mutation.path.split('.'),
    key = parts.pop()!;
  let parent = body;
  for (const part of parts) parent = object(parent[part]);
  if (mutation.remove) delete parent[key];
  else parent[key] = mutation.value!;
  return body;
}
async function state() {
  return {
    events: await rawDb.event.findMany({ orderBy: { id: 'asc' } }),
    grants: await rawDb.rolePermission.findMany({ orderBy: { id: 'asc' } }),
    fields: await rawDb.visitorField.findMany({ orderBy: { id: 'asc' } }),
    values: await rawDb.visitorRecord.findMany({ orderBy: { id: 'asc' } }),
    registrations: await rawDb.registration.findMany({ orderBy: { id: 'asc' } }),
    settings: await rawDb.setting.findMany({ orderBy: { id: 'asc' } }),
    history: await rawDb.settingChange.findMany({ orderBy: { id: 'asc' } }),
    receipts: await rawDb.idempotencyRecord.findMany({ orderBy: { key: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
    memberships: await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } }),
  };
}
beforeEach(async () => {
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
  const admin = await createVolunteer({
    email: 'synthetic-permission-fields@example.test',
    role: 'ADMIN',
  });
  personId = admin.id;
  await makePlatformAdmin(admin.id);
  const opened = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken: admin.token })
    .expect(201);
  expect(opened.body.mfaRequired ?? false).toBe(false);
  token = opened.body.accessToken as string;
  const created = await request(app)
    .post(scoped('/admin/visitor-fields'))
    .set('Authorization', 'Bearer ' + token)
    .send({
      code: 'owned_field',
      label: 'Synthetic owned field',
      type: 'text',
      retentionDays: 1,
      readers: ['ADMIN'],
    })
    .expect(201);
  fieldId = contracts.VisitorFieldRecord.parse(created.body.field).id;
});
it('binds every prepared invalid input to an explicit route/schema variant', () => {
  expect(corpus.formatVersion).toBe(1);
  expect(corpus.variants).toHaveLength(5);
  expect(corpus.invalid).toHaveLength(201);
  expect(new Set(corpus.invalid.map((row) => row.variant + ':' + row.id)).size).toBe(201);
  for (const row of corpus.invalid)
    expect(corpus.variants.filter((variant) => variant.variant === row.variant)).toHaveLength(1);
});
for (const form of ['scoped', 'alias'])
  it.each(corpus.invalid)(
    `${form} refuses $variant $id without a grant, review, field, personal value, history, receipt or business audit effect`,
    async (item) => {
      const variant = corpus.variants.find((row) => row.variant === item.variant)!,
        body = bind(variant, item);
      const parsed = schema(variant.schema).safeParse(body);
      expect(parsed.success).toBe(false);
      if (parsed.success) throw new Error('Expected a reviewed invalid body');
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
      }));
      expect(issues).toEqual(item.expectedIssues);
      const before = await state(),
        path = variant.path.replace(':id', fieldId);
      const target = (form === 'scoped' ? '/api/v1/events/' + eventId : '/api/v1') + path;
      const method =
        variant.method === 'PUT' ? 'put' : variant.method === 'PATCH' ? 'patch' : 'post';
      const response = await request(app)
        [method](target)
        .set('Origin', 'http://localhost:3000')
        .set('Authorization', 'Bearer ' + token)
        .send(body)
        .expect(400);
      const error = contracts.ErrorBody.parse(response.body).error;
      expect(error.code).toBe(contracts.ERROR_CODES.VALIDATION_FAILED);
      expect(error.message).toBe('Invalid request body');
      expect(
        (error.details as { issues: { path: string; code: string }[] }).issues.map(
          ({ path, code }) => ({ path, code }),
        ),
      ).toEqual(issues);
      expect(await state()).toEqual(before);
    },
  );

// These cases mirror the real seven-actor read campaign. Their CI provider is local;
// actual staging expiry and provider authentication are recorded separately.
const readRoutes = [
  { method: 'GET', path: '/admin/visitor-fields', type: 'fields', action: 'Self.Read' },
  { method: 'GET', path: '/permissions', type: 'roles', action: 'Settings.Read' },
  { method: 'GET', path: '/permissions/people/:personId', type: 'member', action: 'Settings.Read' },
  { method: 'POST', path: '/permissions/simulate', type: 'simulate', action: 'Settings.Read' },
] as const;
const kinds = [
  'VOLUNTEER',
  'IC',
  'DEPUTY_COORDINATOR',
  'CHIEF_COORDINATOR',
  'LEAD',
  'ADMIN',
  'FOREIGN',
  'missing',
  'actual-expired',
  'forged',
] as const;
afterEach(async () => {
  await settleDenials();
  vi.setSystemTime(FROZEN_NOW);
});
for (const route of readRoutes)
  for (const form of ['scoped', 'alias'])
    it.each(kinds)(
      `read-role ${route.method} ${route.path} ${form} %s has the exact status and audit effects`,
      async (kind) => {
        const auth = ['missing', 'actual-expired', 'forged'].includes(kind),
          foreign = kind === 'FOREIGN';
        const role = (foreign ? 'VOLUNTEER' : auth ? 'ADMIN' : kind) as contracts.CommitteeRole;
        let access: string | undefined = token,
          memberId = personId,
          ownEventId = eventId;
        if (!auth && kind !== 'ADMIN') {
          const actor = await createVolunteer({
            email: 'synthetic-permission-read@example.test',
            role,
          });
          memberId = actor.id;
          if (foreign) {
            const home = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
            const other = await createEvent({
              organisationId: home.organisationId,
              slug: 'synthetic-permission-foreign',
              name: 'Synthetic permission foreign event',
              timezone: home.timezone,
              status: 'DRAFT',
              categories: [],
              stationTypes: [],
              shiftTemplates: [],
            });
            ownEventId = other.id;
            await rawDb.event.update({
              where: { id: other.id },
              data: { createdAt: new Date(home.createdAt.getTime() + 1000) },
            });
            await rawDb.eventMembership.updateMany({
              where: { eventId, personId: memberId },
              data: { eventId: other.id },
            });
          }
          const opened = await request(app)
            .post('/api/v1/auth/session')
            .set('Origin', 'http://localhost:3000')
            .send({ providerAccessToken: actor.token })
            .expect(201);
          access = opened.body.accessToken as string;
        }
        let ownActions: contracts.MyPermissionsResponse['actions'] | undefined;
        if (!auth) {
          const own = await request(app)
            .get('/api/v1/events/' + ownEventId + '/me')
            .set('Authorization', 'Bearer ' + access)
            .expect(200);
          expect(contracts.MeResponse.parse(own.body)).toMatchObject({
            event: { id: ownEventId },
            volunteer: { id: memberId, role },
          });
          const ownPermissions = await request(app)
            .get('/api/v1/events/' + ownEventId + '/me/permissions')
            .set('Authorization', 'Bearer ' + access)
            .expect(200);
          ownActions = contracts.MyPermissionsResponse.parse(ownPermissions.body).actions;
          const alias = await request(app)
            .get('/api/v1/me')
            .set('Authorization', 'Bearer ' + access)
            .expect(foreign ? 403 : 200);
          if (foreign) expect(alias.body.error.code).toBe(contracts.ERROR_CODES.NOT_PROVISIONED);
          else expect(contracts.MeResponse.parse(alias.body).event.id).toBe(eventId);
        }
        if (kind === 'missing') access = undefined;
        if (kind === 'actual-expired')
          vi.setSystemTime(new Date(decodeJwt(token).exp! * 1000 + 2000));
        if (kind === 'forged') {
          const parts = token.split('.'),
            signature = Buffer.from(parts[2]!, 'base64url');
          signature[0] = signature[0]! ^ 1;
          access = parts.slice(0, 2).join('.') + '.' + signature.toString('base64url');
        }
        const allowed = route.type === 'fields' || role === 'CHIEF_COORDINATOR' || role === 'ADMIN';
        const expected = auth
          ? 401
          : foreign
            ? form === 'scoped'
              ? 404
              : 403
            : allowed
              ? 200
              : 403;
        const pattern = (form === 'scoped' ? '/api/v1/events/:eventId' : '/api/v1') + route.path;
        const path =
          (form === 'scoped' ? '/api/v1/events/' + eventId : '/api/v1') +
          route.path.replace(':personId', memberId);
        const before = await state();
        let pending = request(app)[route.method === 'POST' ? 'post' : 'get'](path);
        if (access) pending = pending.set('Authorization', 'Bearer ' + access);
        if (route.method === 'POST')
          pending = pending.send({ personId: memberId, action: 'Settings.Read' });
        const response = await pending.expect(expected);
        if (expected === 200) {
          if (route.type === 'fields') {
            const actual = contracts.collection(contracts.VisitorFieldRecord).parse(response.body);
            expect(actual.meta).toMatchObject({ count: 1, nextCursor: null });
            expect(actual.data[0]?.id).toBe(fieldId);
          } else {
            expect(response.headers['cache-control']).toBe('no-store');
            if (route.type === 'roles') {
              const actual = contracts.RolePermissionsResponse.parse(response.body).data;
              expect(actual.roles).toHaveLength(6);
              expect(actual.canEdit).toBe(role === 'ADMIN');
            } else if (route.type === 'member') {
              const actual = contracts.MemberPermissionsResponse.parse(response.body).data;
              expect(actual).toMatchObject({ personId: memberId, role });
              expect(actual.actions).toEqual(ownActions);
            } else {
              const actual = contracts.SimulatePermissionResponse.parse(response.body).data;
              expect(actual.allowed).toBe(true);
              expect(actual.policies).toContain('grant.Settings.Read');
            }
          }
        } else {
          const error = contracts.ErrorBody.parse(response.body).error;
          expect(error.code).toBe(
            auth
              ? contracts.ERROR_CODES.UNAUTHENTICATED
              : foreign
                ? form === 'scoped'
                  ? contracts.ERROR_CODES.NOT_FOUND
                  : contracts.ERROR_CODES.NOT_PROVISIONED
                : contracts.ERROR_CODES.FORBIDDEN,
          );
          if (!auth && !foreign) expect(error.details).toEqual({ actions: [route.action] });
          else expect(error.details).toBeUndefined();
        }
        await settleDenials();
        const after = await state();
        if (expected === 403 && !auth && !foreign) {
          const added = after.audits.filter(
            (row) => !before.audits.some((old) => old.id === row.id),
          );
          expect(added).toHaveLength(1);
          expect(added[0]).toMatchObject({
            action: 'authorization.denied',
            actorId: memberId,
            actorSub: decodeJwt(access!).sub,
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
          expect({
            ...after,
            audits: after.audits.filter((row) => before.audits.some((old) => old.id === row.id)),
          }).toEqual(before);
        } else expect(after).toEqual(before);
        if (auth) {
          vi.setSystemTime(FROZEN_NOW);
          const control = await request(app)
            .get('/api/v1/events/' + eventId + '/me')
            .set('Authorization', 'Bearer ' + token)
            .expect(200);
          expect(contracts.MeResponse.parse(control.body).volunteer.id).toBe(personId);
        }
      },
    );
