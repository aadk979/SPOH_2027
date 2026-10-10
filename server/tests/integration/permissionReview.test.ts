import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RolePermissionsResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import * as audit from '../../src/platform/audit/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  makePlatformAdmin,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
afterEach(() => vi.restoreAllMocks());
let eventId: string;
let admin: TestVolunteer;
const url = () => `/api/v1/events/${eventId}/permissions`;
const read = async () =>
  RolePermissionsResponse.parse(
    (await request(app).get(url()).set('Authorization', bearer(admin))).body,
  ).data;
const send = (body: object, who = admin) =>
  request(app).post(`${url()}/review`).set('Authorization', bearer(who)).send(body);
const body = async () => ({
  expectedVersion: (await read()).review!.version,
  reason: 'Reviewed all roles and fixed guardrails',
  idempotencyKey: idempotencyKey(),
});

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'permission-review@test.example', role: 'ADMIN' });
  await makePlatformAdmin(admin.id);
});

it('reviews the exact current version, with one attributed audit and a redacted retry receipt', async () => {
  const input = await body();
  const response = await send(input);
  expect(response.status).toBe(200);
  expect(RolePermissionsResponse.parse(response.body).data.review).toEqual({
    version: input.expectedVersion,
    reviewedVersion: input.expectedVersion,
    reviewedAt: FROZEN_NOW.toISOString(),
  });
  expect(
    await rawDb.auditLog.findMany({ where: { eventId, action: 'permissions.review' } }),
  ).toEqual([
    expect.objectContaining({
      actorId: admin.id,
      after: expect.objectContaining({
        reviewedVersion: input.expectedVersion,
        reason: input.reason,
      }),
    }),
  ]);
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: input.idempotencyKey } }))
      .responseBody,
  ).toEqual({ reviewed: true });
  expect((await send(input)).status).toBe(200);
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'permissions.review' } })).toBe(1);
});

it('invalidates review after every grants writer and returns the current state on retry', async () => {
  const input = await body();
  expect((await send(input)).status).toBe(200);
  const grant = await rawDb.rolePermission.create({
    data: { eventId, role: 'LEAD', action: 'Settings.Read' },
  });
  const replay = RolePermissionsResponse.parse((await send(input)).body).data.review!;
  expect(replay.version).toBe(input.expectedVersion + 1);
  expect(replay.reviewedVersion).toBe(input.expectedVersion);
  await rawDb.rolePermission.update({
    where: { id: grant.id, eventId },
    data: { action: 'Permissions.Edit' },
  });
  expect((await read()).review!.version).toBe(input.expectedVersion + 2);
  await rawDb.rolePermission.delete({ where: { id: grant.id, eventId } });
  expect((await read()).review!.version).toBe(input.expectedVersion + 3);
});

it('refuses a stale version and unapproved role, with no review effects', async () => {
  const input = await body();
  await rawDb.rolePermission.create({ data: { eventId, role: 'LEAD', action: 'Settings.Read' } });
  expect((await send(input)).status).toBe(409);
  const chief = await createVolunteer({
    email: 'permission-review-chief@test.example',
    role: 'CHIEF_COORDINATOR',
  });
  expect((await send(await body(), chief)).status).toBe(403);
  expect((await read()).review!.reviewedAt).toBeNull();
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'permissions.review' } })).toBe(0);
});

it('rolls review evidence back if its audit fails, then retries the same intent safely', async () => {
  const input = await body();
  const spy = vi
    .spyOn(audit, 'writeAudit')
    .mockRejectedValueOnce(new Error('Synthetic audit failure'));
  expect((await send(input)).status).toBe(500);
  spy.mockRestore();
  expect((await read()).review!.reviewedAt).toBeNull();
  expect((await send(input)).status).toBe(200);
});
