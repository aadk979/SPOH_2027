import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { CategoryScheduleListResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { supportedCategorySchedule } from '../../src/modules/taxonomy/domain/categoryScheduleProvenance.js';
import { toCategorySchedule } from '../../src/modules/taxonomy/data/categoryScheduleMapper.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer } from '../helpers/fixtures.js';
import {
  lifecycleAt,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

const app = createApp();
let f: ScheduledLifecycleFixture;
let body: {
  active: boolean;
  expectedActive: boolean;
  expectedUpdatedAt: string;
  runAt: string;
  reason: string;
  idempotencyKey: string;
};
const endpoint = (categoryId = f.categoryId) =>
  `/api/v1/events/${f.eventId}/admin/capture-categories/${categoryId}/schedules`;
const create = () =>
  request(app).post(endpoint()).set('Authorization', bearer(f.creator)).send(body);
const get = (id: string) =>
  request(app).get(`${endpoint()}/${id}`).set('Authorization', bearer(f.creator));
const list = (query = '') =>
  request(app).get(`${endpoint()}${query}`).set('Authorization', bearer(f.creator));
const definitions = (id: string) =>
  rawDb.auditLog.findMany({
    where: {
      eventId: f.eventId,
      entityType: 'ScheduledAction',
      entityId: id,
      source: 'USER',
      action: { in: ['schedule.create', 'schedule.update'] },
    },
    select: { action: true, actorId: true, after: true },
  });

beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
  const category = await rawDb.captureCategory.findUniqueOrThrow({ where: { id: f.categoryId } });
  body = {
    active: false,
    expectedActive: category.active,
    expectedUpdatedAt: category.updatedAt.toISOString(),
    runAt: lifecycleAt(60_000).toISOString(),
    reason: 'Reviewed category provenance',
    idempotencyKey: randomUUID(),
  };
  await rawDb.setting.create({
    data: {
      scope: 'PLATFORM',
      scopeId: f.organisationId,
      eventId: null,
      key: 'rateLimit.max.admin',
      value: 500,
      version: 1,
    },
  });
});

it.each(['missing', 'malformed', 'wrong actor', 'duplicate'] as const)(
  'requires one strict matching creation audit: %s',
  async (kind) => {
    const first = await create();
    const id = first.body.schedule.id;
    const original = await definitions(id);
    const row = await f.action(id);
    const audits =
      kind === 'missing'
        ? []
        : kind === 'malformed'
          ? [{ ...original[0]!, after: { private: 'marker' } }]
          : kind === 'wrong actor'
            ? [{ ...original[0]!, actorId: 'foreign-person' }]
            : [...original, original[0]!];
    expect(supportedCategorySchedule(row, audits)).toBeNull();
  },
);

it.each([
  'station kind',
  'foreign category',
  'desired mismatch',
  'extra payload',
  'system creator',
  'recurrence',
  'dedupe key',
  'foreign type',
  'future definition',
  'wrong scheduledFor',
] as const)('refuses unsupported definition boundary: %s', async (kind) => {
  const first = await create();
  const id = first.body.schedule.id;
  const row = await f.action(id);
  const originals = await definitions(id);
  const patch =
    kind === 'station kind'
      ? { payload: { kind: 'station', id: f.categoryId, active: false } }
      : kind === 'foreign category'
        ? { payload: { kind: 'category', id: 'foreign-category', active: false } }
        : kind === 'desired mismatch'
          ? { payload: { kind: 'category', id: f.categoryId, active: true } }
          : kind === 'extra payload'
            ? {
                payload: {
                  kind: 'category',
                  id: f.categoryId,
                  active: false,
                  reason: 'private-marker',
                },
              }
            : kind === 'system creator'
              ? { createdByPersonId: null }
              : kind === 'recurrence'
                ? { recurrence: 5 }
                : kind === 'dedupe key'
                  ? { dedupeKey: 'system-occurrence' }
                  : kind === 'foreign type'
                    ? { type: 'event.transition' }
                    : kind === 'future definition'
                      ? { version: 0 }
                      : { scheduledFor: lifecycleAt(120_000) };
  expect(supportedCategorySchedule({ ...row, ...patch }, originals)).toBeNull();
});

it('uses original due time, even when worker retry eligibility/version advance', async () => {
  const first = await create();
  const row = await f.action(first.body.schedule.id);
  const originals = await definitions(row.id);
  expect(
    supportedCategorySchedule({ ...row, runAt: lifecycleAt(90_000), version: 3 }, originals)?.intent
      .runAt,
  ).toBe(body.runAt);
  expect(supportedCategorySchedule({ ...row, scheduledFor: null }, originals)?.intent.runAt).toBe(
    body.runAt,
  );
  expect(
    supportedCategorySchedule(
      { ...row, scheduledFor: null, runAt: lifecycleAt(90_000) },
      originals,
    ),
  ).toBeNull();
});

it('matches canonical parsed edit intent rather than raw JSON property order/offsets', async () => {
  const first = await create();
  const editedBody = {
    ...body,
    active: true,
    expectedScheduleVersion: 1,
    runAt: lifecycleAt(120_000).toISOString(),
    reason: 'Edited category provenance',
    idempotencyKey: randomUUID(),
  };
  expect(
    (
      await request(app)
        .patch(`${endpoint()}/${first.body.schedule.id}`)
        .set('Authorization', bearer(f.creator))
        .send(editedBody)
    ).status,
  ).toBe(200);
  const row = await f.action(first.body.schedule.id);
  const originals = await definitions(row.id);
  const latest = originals.find((audit) => audit.action === 'schedule.update')!;
  const parsed = latest.after as {
    version: number;
    intent: Record<string, unknown>;
    request: Record<string, unknown>;
  };
  const offset = '2027-01-07T11:32:00+08:00';
  const reordered = {
    request: {
      ...Object.fromEntries(Object.entries(parsed.request).reverse()),
      reason: `  ${parsed.request.reason as string}  `,
      runAt: offset,
    },
    intent: { ...Object.fromEntries(Object.entries(parsed.intent).reverse()), runAt: offset },
    version: parsed.version,
  };
  expect(
    supportedCategorySchedule(
      row,
      originals.map((entry) => (entry === latest ? { ...entry, after: reordered } : entry)),
    )?.intent.active,
  ).toBe(true);
  expect(supportedCategorySchedule({ ...row, version: 7 }, originals)?.version).toBe(2);
});

it.each([
  'duplicate version',
  'foreign creator',
  'foreign category',
  'mismatched request',
  'future version',
] as const)(
  'rejects incoherent edit audit %s without falling back to older intent',
  async (kind) => {
    const first = await create();
    const id = first.body.schedule.id;
    const editedBody = {
      ...body,
      active: true,
      expectedScheduleVersion: 1,
      runAt: lifecycleAt(120_000).toISOString(),
      idempotencyKey: randomUUID(),
    };
    expect(
      (
        await request(app)
          .patch(`${endpoint()}/${id}`)
          .set('Authorization', bearer(f.creator))
          .send(editedBody)
      ).status,
    ).toBe(200);
    const row = await f.action(id);
    const originals = await definitions(id);
    const edit = originals.find((entry) => entry.action === 'schedule.update')!;
    const after = edit.after as {
      version: number;
      intent: Record<string, unknown>;
      request: Record<string, unknown>;
    };
    const altered =
      kind === 'foreign creator'
        ? { ...edit, actorId: 'foreign-person' }
        : kind === 'foreign category'
          ? {
              ...edit,
              after: { ...after, intent: { ...after.intent, categoryId: 'foreign-category' } },
            }
          : kind === 'mismatched request'
            ? { ...edit, after: { ...after, request: { ...after.request, active: false } } }
            : kind === 'future version'
              ? {
                  ...edit,
                  after: {
                    ...after,
                    version: 9,
                    request: { ...after.request, expectedScheduleVersion: 8 },
                  },
                }
              : edit;
    const audits =
      kind === 'duplicate version'
        ? [...originals, edit]
        : originals.map((entry) => (entry === edit ? altered : entry));
    expect(supportedCategorySchedule(row, audits)).toBeNull();
  },
);

it('omits unaudited worker fixtures but preserves raw cursor progress to supported work', async () => {
  const first = await create();
  const raw = await rawDb.scheduledAction.create({
    data: {
      eventId: f.eventId,
      type: 'taxonomy.setActive',
      createdByPersonId: f.creator.id,
      payload: { kind: 'category', id: f.categoryId, active: true },
      runAt: lifecycleAt(120_000),
      createdAt: lifecycleAt(1),
    },
  });
  // Producer createdAt is frozen now; this later synthetic unaudited row sorts first.
  const page = CategoryScheduleListResponse.parse((await list('?limit=1')).body);
  expect(page.data).toEqual([]);
  expect(page.meta).toEqual({ count: 0, nextCursor: raw.id });
  const next = CategoryScheduleListResponse.parse((await list(`?limit=1&cursor=${raw.id}`)).body);
  expect(next.data[0]?.id).toBe(first.body.schedule.id);
  expect(next.meta.nextCursor).toBeNull();
  expect((await get(raw.id)).status).toBe(404);
});

it.each(['creation audit', 'payload', 'definition timestamp'] as const)(
  'keeps malformed stored %s private at public reads/list',
  async (kind) => {
    const first = await create();
    const id = first.body.schedule.id;
    if (kind === 'creation audit')
      await rawDb.auditLog.updateMany({
        where: { eventId: f.eventId, entityId: id, action: 'schedule.create' },
        data: { after: { privateMarker: 'must-not-cross-wire' } },
      });
    else
      await rawDb.scheduledAction.update({
        where: { id },
        data:
          kind === 'payload'
            ? {
                payload: {
                  kind: 'category',
                  id: f.categoryId,
                  active: false,
                  privateMarker: 'must-not-cross-wire',
                },
              }
            : { scheduledFor: lifecycleAt(120_000), runAt: lifecycleAt(120_000) },
      });
    expect((await get(id)).status).toBe(404);
    const page = await list();
    expect(page.status).toBe(200);
    expect(page.body.data).toEqual([]);
    expect(JSON.stringify(page.body)).not.toContain('must-not-cross-wire');
  },
);

it('keeps invalid record metadata unavailable while preserving the database attempt guard', async () => {
  const first = await create();
  const row = await f.action(first.body.schedule.id);
  const audits = (await definitions(row.id)).map((entry) => ({ ...entry, entityId: row.id }));
  expect(
    toCategorySchedule({ ...row, maxAttempts: 0 }, { personId: f.creator.id, audits }),
  ).toBeNull();
  await expect(
    rawDb.scheduledAction.update({ where: { id: row.id }, data: { maxAttempts: 0 } }),
  ).rejects.toThrow('ScheduledAction_attempts_check');
  expect((await get(row.id)).status).toBe(200);
});
