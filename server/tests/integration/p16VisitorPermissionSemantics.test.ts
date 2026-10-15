// Prepared privately for the next batch. No staging or CI acceptance is inferred.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { decodeJwt } from 'jose';
import * as contracts from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, makePlatformAdmin, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

type Body = Record<string, unknown>;
type Case = {
  variant: string;
  id: string;
  mutation: { path: string; remove?: boolean; value?: unknown };
};
type Variant = { variant: string; method: 'POST' | 'PUT' | 'PATCH'; path: string; base: Body };
const corpus = JSON.parse(
  readFileSync(
    new URL('../fixtures/p16-visitor-permissions-body-cases.json', import.meta.url),
    'utf8',
  ),
) as {
  variants: Variant[];
  semantic: Case[];
};
const app = createApp();
let eventId: string, personId: string, token: string, field: contracts.VisitorFieldRecord;
const url = (path: string, form = 'scoped') =>
  (form === 'scoped' ? '/api/v1/events/' + eventId : '/api/v1') + path;
const send = (method: 'post' | 'put' | 'patch', path: string, body: Body, form = 'scoped') =>
  request(app)
    [method](url(path, form))
    .set('Origin', 'http://localhost:3000')
    .set('Authorization', 'Bearer ' + token)
    .send(body);
const get = (path: string, form = 'scoped') =>
  request(app)
    .get(url(path, form))
    .set('Authorization', 'Bearer ' + token);
const permissions = async () =>
  contracts.RolePermissionsResponse.parse((await get('/permissions').expect(200)).body);
const fields = async () =>
  contracts
    .collection(contracts.VisitorFieldRecord)
    .parse((await get('/admin/visitor-fields').expect(200)).body);
async function protectedState() {
  return {
    settings: await rawDb.setting.findMany({ orderBy: { id: 'asc' } }),
    history: await rawDb.settingChange.findMany({ orderBy: { id: 'asc' } }),
    memberships: await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } }),
    visitors: await rawDb.visitorRecord.findMany({ orderBy: { id: 'asc' } }),
    registrations: await rawDb.registration.findMany({ orderBy: { id: 'asc' } }),
  };
}
async function audits() {
  return rawDb.auditLog.findMany({ orderBy: { id: 'asc' } });
}
async function receipts() {
  return rawDb.idempotencyRecord.findMany({ orderBy: { key: 'asc' } });
}
async function assertAudits(
  before: Awaited<ReturnType<typeof audits>>,
  expected: {
    action: string;
    entityType: string;
    entityId?: string;
    before?: unknown;
    after: unknown;
  }[],
) {
  const after = await audits();
  expect(after.filter((row) => before.some((old) => old.id === row.id))).toEqual(before);
  const added = after.filter((row) => !before.some((old) => old.id === row.id));
  expect(added).toHaveLength(expected.length);
  for (const item of expected) {
    const matches = added.filter(
      (row) =>
        row.action === item.action &&
        (item.entityId === undefined || row.entityId === item.entityId),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      actorId: personId,
      actorSub: decodeJwt(token).sub,
      eventId,
      ...item,
    });
  }
}
function bind(item: Case, version: number): Body {
  const variant = corpus.variants.find((row) => row.variant === item.variant)!;
  const body = structuredClone(variant.base);
  if ('code' in body && item.mutation.path !== 'code')
    body.code = 'qa_sem_' + randomUUID().replaceAll('-', '').slice(0, 16);
  if (body.personId === 'OWN_PERSON') body.personId = personId;
  if (body.resource) (body.resource as Body).id = eventId;
  if ('expectedVersion' in body) body.expectedVersion = version;
  const parts = item.mutation.path.split('.'),
    key = parts.pop()!;
  let parent = body;
  for (const part of parts) parent = parent[part] as Body;
  if (item.mutation.remove) delete parent[key];
  else parent[key] = structuredClone(item.mutation.value);
  // The corpus UUID is a fixture placeholder: every logical case has one fresh UUID,
  // retained exactly across its scoped/alias replay and changed-intent refusal.
  if ('idempotencyKey' in body) body.idempotencyKey = randomUUID();
  return body;
}
beforeEach(async () => {
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
  const actor = await createVolunteer({ email: 'synthetic-semantics@example.test', role: 'ADMIN' });
  personId = actor.id;
  await makePlatformAdmin(actor.id);
  const opened = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', 'http://localhost:3000')
    .send({ providerAccessToken: actor.token })
    .expect(201);
  token = opened.body.accessToken as string;
  const created = await send('post', '/admin/visitor-fields', {
    code: 'qa_original',
    label: 'Synthetic protected field',
    type: 'text',
    retentionDays: 1,
    readers: ['ADMIN'],
  }).expect(201);
  field = contracts.VisitorFieldRecord.parse(created.body.field);
  const retired = await send('patch', '/admin/visitor-fields/' + field.id, {
    active: false,
  }).expect(200);
  field = contracts.VisitorFieldRecord.parse(retired.body.field);
});
it.each(corpus.semantic)(
  '$variant $id has explicit normalized, scope, audit and receipt outcomes through both forms',
  async (item) => {
    const originalPermissions = await permissions(),
      originalFields = await fields(),
      untouched = await protectedState();
    const originalAudits = await audits(),
      originalReceipts = await receipts();
    const body = bind(item, originalPermissions.data.review!.version);
    if (item.variant === 'visitor-create') {
      const parsed = contracts.CreateVisitorFieldRequest.parse(body);
      const created = await send('post', '/admin/visitor-fields', body).expect(201);
      const actual = contracts.VisitorFieldRecord.parse(created.body.field);
      expect(actual).toEqual({ ...parsed, id: actual.id, active: true });
      const afterCreate = await fields();
      expect(afterCreate.data).toHaveLength(originalFields.data.length + 1);
      expect(afterCreate.data.find((row) => row.id === actual.id)).toEqual(actual);
      expect(afterCreate.data.filter((row) => row.id !== actual.id)).toEqual(originalFields.data);
      const duplicate = await send('post', '/admin/visitor-fields', body, 'alias').expect(409);
      expect(duplicate.body.error.code).toBe(contracts.ERROR_CODES.CONFLICT);
      expect(await fields()).toEqual(afterCreate);
      const retired = await send(
        'patch',
        '/admin/visitor-fields/' + actual.id,
        { active: false },
        'alias',
      ).expect(200);
      expect(contracts.VisitorFieldRecord.parse(retired.body.field)).toEqual({
        ...actual,
        active: false,
      });
      expect(
        contracts
          .collection(contracts.VisitorFieldRecord)
          .parse((await get('/admin/visitor-fields', 'alias')).body).data,
      ).toEqual((await fields()).data);
      await assertAudits(originalAudits, [
        {
          action: 'visitorField.create',
          entityType: 'VisitorField',
          entityId: actual.id,
          after: parsed,
        },
        {
          action: 'visitorField.update',
          entityType: 'VisitorField',
          entityId: actual.id,
          before: {
            label: actual.label,
            retentionDays: actual.retentionDays,
            readers: actual.readers,
            active: true,
          },
          after: { active: false },
        },
      ]);
      expect(await receipts()).toEqual(originalReceipts);
      expect(await permissions()).toEqual(originalPermissions);
    } else if (item.variant === 'visitor-update') {
      const parsed = contracts.UpdateVisitorFieldRequest.parse(body),
        expected = { ...field, ...parsed };
      const path = '/admin/visitor-fields/' + field.id;
      const first = await send('patch', path, body).expect(200);
      expect(contracts.VisitorFieldRecord.parse(first.body.field)).toEqual(expected);
      const repeated = await send('patch', path, body, 'alias').expect(200);
      expect(contracts.VisitorFieldRecord.parse(repeated.body.field)).toEqual(expected);
      expect((await fields()).data).toEqual([expected]);
      const restore = {
        label: field.label,
        retentionDays: field.retentionDays,
        readers: field.readers,
        sortOrder: field.sortOrder,
        active: field.active,
      };
      const restored = await send('patch', path, restore, 'alias').expect(200);
      expect(contracts.VisitorFieldRecord.parse(restored.body.field)).toEqual(field);
      const added = (await audits()).filter(
        (row) => !originalAudits.some((old) => old.id === row.id),
      );
      expect(added).toHaveLength(3);
      expect(
        added.every(
          (row) =>
            row.action === 'visitorField.update' &&
            row.entityId === field.id &&
            row.actorId === personId &&
            row.eventId === eventId,
        ),
      ).toBe(true);
      expect(added.filter((row) => isDeepStrictEqual(row.after, parsed))).toHaveLength(2);
      expect(added.filter((row) => isDeepStrictEqual(row.after, restore))).toHaveLength(1);
      expect(await fields()).toEqual(originalFields);
      expect(await permissions()).toEqual(originalPermissions);
      expect(await receipts()).toEqual(originalReceipts);
    } else if (item.variant === 'permission-grant') {
      const parsed = contracts.ChangeRolePermissionRequest.parse(body);
      const invalid = item.id === 'role:volunteer' || item.id === 'action:fixed-action';
      if (invalid) {
        for (const form of ['scoped', 'alias']) {
          const response = await send('put', '/permissions', body, form).expect(400);
          expect(response.headers['cache-control']).toBe('no-store');
          expect(response.body.error.code).toBe(contracts.ERROR_CODES.VALIDATION_FAILED);
          expect(response.body.error.message).toBe(
            item.id === 'action:fixed-action'
              ? 'That permission is fixed.'
              : 'That permission cannot be given to a role below its minimum.',
          );
          expect(response.body.error.details).toEqual(
            item.id === 'action:fixed-action'
              ? { action: parsed.action }
              : { action: parsed.action, role: parsed.role, minimumRole: 'CHIEF_COORDINATOR' },
          );
        }
        expect(await audits()).toEqual(originalAudits);
        expect(await receipts()).toEqual(originalReceipts);
        expect(await permissions()).toEqual(originalPermissions);
      } else {
        const beforeGranted = originalPermissions.data.roles
          .find((row) => row.role === parsed.role)!
          .grants.includes(parsed.action);
        const changed = beforeGranted !== parsed.granted;
        const first = await send('put', '/permissions', body).expect(200);
        expect(first.headers['cache-control']).toBe('no-store');
        const current = contracts.RolePermissionsResponse.parse(first.body);
        expect(
          current.data.roles
            .find((row) => row.role === parsed.role)!
            .grants.includes(parsed.action),
        ).toBe(parsed.granted);
        expect(current.data.review!.version).toBe(
          originalPermissions.data.review!.version + Number(changed),
        );
        const replay = await send('put', '/permissions', body, 'alias').expect(200);
        expect(replay.headers['cache-control']).toBe('no-store');
        expect(replay.body).toEqual(first.body);
        const conflict = await send(
          'put',
          '/permissions',
          { ...body, granted: !parsed.granted },
          'alias',
        ).expect(409);
        expect(conflict.body.error.code).toBe(contracts.ERROR_CODES.IDEMPOTENCY_KEY_REUSE);
        expect(conflict.headers['cache-control']).toBe('no-store');
        expect(await permissions()).toEqual(current);
        if (changed) {
          const restored = await send(
            'put',
            '/permissions',
            { ...body, granted: beforeGranted, idempotencyKey: randomUUID() },
            'alias',
          ).expect(200);
          const final = contracts.RolePermissionsResponse.parse(restored.body);
          expect(final.data.roles).toEqual(originalPermissions.data.roles);
          expect(final.data.review).toEqual({
            ...originalPermissions.data.review,
            version: originalPermissions.data.review!.version + 2,
          });
        }
        const added = (await audits()).filter(
          (row) => !originalAudits.some((old) => old.id === row.id),
        );
        expect(added).toHaveLength(changed ? 2 : 0);
        for (const row of added)
          expect(row).toMatchObject({
            action: 'permissions.change',
            actorId: personId,
            eventId,
            entityType: 'RolePermission',
          });
        if (changed) {
          expect(added.map((row) => row.after)).toEqual(
            expect.arrayContaining([
              { role: parsed.role, action: parsed.action, granted: parsed.granted },
              { role: parsed.role, action: parsed.action, granted: beforeGranted },
            ]),
          );
        }
        expect((await receipts()).length - originalReceipts.length).toBe(changed ? 2 : 1);
      }
      expect(await fields()).toEqual(originalFields);
    } else if (item.variant === 'permission-review') {
      const parsed = contracts.ReviewRolePermissionsRequest.parse(body);
      const stale = parsed.expectedVersion !== originalPermissions.data.review!.version;
      const first = await send('post', '/permissions/review', body).expect(stale ? 409 : 200);
      const repeated = await send('post', '/permissions/review', body, 'alias').expect(
        stale ? 409 : 200,
      );
      for (const response of [first, repeated])
        expect(response.headers['cache-control']).toBe('no-store');
      if (stale) {
        for (const response of [first, repeated]) {
          expect(response.body.error.code).toBe(contracts.ERROR_CODES.CONFLICT);
          expect(response.body.error.message).toBe('Permissions changed. Reload and review again.');
        }
        expect(await audits()).toEqual(originalAudits);
        expect(await receipts()).toEqual(originalReceipts);
        expect(await permissions()).toEqual(originalPermissions);
      } else {
        const data = contracts.RolePermissionsResponse.parse(first.body);
        expect(repeated.body).toEqual(first.body);
        expect(first.headers['cache-control']).toBe('no-store');
        expect(repeated.headers['cache-control']).toBe('no-store');
        expect(data.data.roles).toEqual(originalPermissions.data.roles);
        expect(data.data.review).toEqual({
          version: parsed.expectedVersion,
          reviewedVersion: parsed.expectedVersion,
          reviewedAt: FROZEN_NOW.toISOString(),
        });
        const changed = await send(
          'post',
          '/permissions/review',
          { ...body, reason: parsed.reason === 'abc' ? 'def' : 'Different synthetic intent' },
          'alias',
        ).expect(409);
        expect(changed.body.error.code).toBe(contracts.ERROR_CODES.IDEMPOTENCY_KEY_REUSE);
        expect(await permissions()).toEqual(data);
        await assertAudits(originalAudits, [
          {
            action: 'permissions.review',
            entityType: 'Event',
            entityId: eventId,
            before: { reviewedVersion: originalPermissions.data.review!.reviewedVersion },
            after: {
              reviewedVersion: parsed.expectedVersion,
              reviewedAt: FROZEN_NOW.toISOString(),
              reason: parsed.reason,
            },
          },
        ]);
        expect((await receipts()).length - originalReceipts.length).toBe(1);
      }
      expect(await fields()).toEqual(originalFields);
    } else {
      expect(item.variant).toBe('permission-simulate');
      const parsed = contracts.SimulatePermissionRequest.parse(body);
      const missing = !['resource:missing', 'action:fixed-action'].includes(item.id);
      for (const form of ['scoped', 'alias']) {
        const response = await send('post', '/permissions/simulate', body, form).expect(
          missing ? 404 : 200,
        );
        expect(response.headers['cache-control']).toBe('no-store');
        if (missing) expect(response.body.error.code).toBe(contracts.ERROR_CODES.NOT_FOUND);
        else {
          expect(response.headers['cache-control']).toBe('no-store');
          const actual = contracts.SimulatePermissionResponse.parse(response.body).data;
          expect(actual.allowed).toBe(parsed.action === 'Settings.Read');
          expect(actual.policies).toEqual(
            parsed.action === 'Settings.Read' ? ['grant.Settings.Read'] : [],
          );
          expect(actual.explanation).toBe(
            parsed.action === 'Settings.Read'
              ? "Their role may see the event's configuration in this event."
              : 'Their role has not been given permission to see your own details.',
          );
        }
      }
      expect(await permissions()).toEqual(originalPermissions);
      expect(await fields()).toEqual(originalFields);
      expect(await receipts()).toEqual(originalReceipts);
      expect(await audits()).toEqual(originalAudits);
    }
    expect(await protectedState()).toEqual(untouched);
  },
);
