import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decodeJwt } from 'jose';
import * as contracts from '@spoh/shared';
import type { z } from 'zod';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { settleDenials } from '../../src/platform/http/authorizationDenials.js';
import { FROZEN_NOW } from '../setup.js';
import { rawDb, resetDatabase } from './db.js';
import { createStation, createVolunteer, makePlatformAdmin, testEvent } from './fixtures.js';

type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
type Body = Record<string, Value>;
type Variant = {
  variant: string;
  method: 'PATCH' | 'POST';
  path: string;
  schemaName: string;
  base: Body;
};
type Binding = {
  variant: string;
  id: string;
  category?: string;
  expectedEffect?: string;
  mutation: {
    path?: string;
    remove?: string | boolean;
    replace?: string;
    add?: string;
    value?: Value;
  };
};
type Corpus = {
  formatVersion: number;
  domain: string;
  variants: Variant[];
  invalid: Binding[];
  semantic: Binding[];
};

function object(value: Value | undefined): Body {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a reviewed object binding');
  return value;
}
function bodyFor(
  variant: Variant,
  item: Binding,
  adminMembershipId: string,
  countingStationId: string,
): Body {
  const body = structuredClone(variant.base);
  if (body.value === 'OWN_ACTIVE_ADMIN_MEMBERSHIP') body.value = adminMembershipId;
  if (variant.variant === 'counts-footfall')
    object(object(body.value).source).stationId = countingStationId;
  const mutation = item.mutation;
  const path =
    mutation.path ??
    (typeof mutation.remove === 'string' ? mutation.remove : (mutation.replace ?? mutation.add));
  if (!path) throw new Error('Missing reviewed mutation path');
  const parts = path.split('.'),
    field = parts.pop()!;
  let parent = body;
  for (const part of parts) parent = object(parent[part]);
  if (mutation.remove) delete parent[field];
  else parent[field] = mutation.value!;
  return body;
}
async function state() {
  return {
    events: await rawDb.event.findMany({ orderBy: { id: 'asc' } }),
    settings: await rawDb.setting.findMany({ orderBy: { id: 'asc' } }),
    history: await rawDb.settingChange.findMany({ orderBy: { id: 'asc' } }),
    receipts: await rawDb.idempotencyRecord.findMany({ orderBy: { key: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
    memberships: await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } }),
    visitors: await rawDb.visitorRecord.findMany({ orderBy: { id: 'asc' } }),
    stations: await rawDb.station.findMany({ orderBy: { id: 'asc' } }),
  };
}
function schema(name: string): z.ZodType<Body> {
  return (contracts as unknown as Record<string, z.ZodType<Body>>)[name]!;
}
type SettingsContext = {
  app: ReturnType<typeof createApp>;
  current: () => { eventId: string; token: string; adminId: string };
};
export function registerSettingsCases(family: 'attendance' | 'product'): SettingsContext {
  const corpus = JSON.parse(
    readFileSync(new URL(`../fixtures/p16-${family}-settings-cases.json`, import.meta.url), 'utf8'),
  ) as Corpus;
  const app = createApp();
  let eventId: string,
    token: string,
    adminMembershipId: string,
    countingStationId: string,
    adminId: string;
  beforeEach(async () => {
    vi.setSystemTime(FROZEN_NOW);
    await resetDatabase();
    ({ eventId } = await testEvent());
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
    const admin = await createVolunteer({
      email: `synthetic-p16-${family}@example.test`,
      role: 'ADMIN',
    });
    adminId = admin.id;
    await makePlatformAdmin(admin.id);
    adminMembershipId = (
      await rawDb.eventMembership.findUniqueOrThrow({
        where: { eventId_personId: { eventId, personId: admin.id } },
      })
    ).id;
    countingStationId = (await createStation({ code: 'SYNTHETIC_COUNTING', countsEntry: true })).id;
    const opened = await request(app)
      .post('/api/v1/auth/session')
      .set('Origin', 'http://localhost:3000')
      .send({ providerAccessToken: admin.token })
      .expect(201);
    expect(opened.body.mfaRequired ?? false).toBe(false);
    token = opened.body.accessToken as string;
  });
  const send = (variant: Variant, form: string, body: Body) =>
    request(app)
      [variant.method === 'POST' ? 'post' : 'patch'](
        (form === 'scoped' ? `/api/v1/events/${eventId}` : '/api/v1') + variant.path,
      )
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', 'Bearer ' + token)
      .send(body);
  const read = async () => {
    const response = await request(app)
      .get(
        `/api/v1/events/${eventId}/admin/${family === 'attendance' ? 'attendance-settings' : 'event-settings'}`,
      )
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    return family === 'attendance'
      ? contracts.AttendanceConfig.parse(response.body)
      : contracts.EventSettingsResponse.parse(response.body);
  };
  it('binds every reviewed field case to one explicit variant', () => {
    expect(corpus.formatVersion).toBe(1);
    expect(corpus.domain).toBe(family + '-settings');
    expect(corpus.invalid).toHaveLength(family === 'attendance' ? 72 : 318);
    expect(corpus.semantic).toHaveLength(family === 'attendance' ? 32 : 56);
    const cases = [...corpus.invalid, ...corpus.semantic];
    expect(new Set(cases.map((row) => row.variant + ':' + row.id)).size).toBe(cases.length);
    for (const item of cases)
      expect(corpus.variants.filter((row) => row.variant === item.variant)).toHaveLength(1);
  });
  for (const form of ['scoped', 'alias']) {
    it.each(corpus.invalid)(
      `${form} refuses $variant $id with unchanged values, versions, history, receipts and audits`,
      async (item) => {
        const variant = corpus.variants.find((row) => row.variant === item.variant)!;
        const body = bodyFor(variant, item, adminMembershipId, countingStationId),
          parsed = schema(variant.schemaName).safeParse(body);
        expect(parsed.success).toBe(false);
        if (parsed.success) throw new Error('Expected invalid binding');
        const before = await state(),
          response = await send(variant, form, body).expect(400);
        const error = contracts.ErrorBody.parse(response.body).error;
        expect(error.code).toBe(contracts.ERROR_CODES.VALIDATION_FAILED);
        if (variant.method === 'PATCH' && (typeof body.key !== 'string' || body.key.length === 0)) {
          expect(error.message).toBe('key is required');
          expect(error.details).toBeUndefined();
        } else if (
          variant.method === 'PATCH' &&
          ['unknown.key', 'product.unknown'].includes(String(body.key))
        ) {
          expect(error.message).toBe('Unknown setting ' + String(body.key));
          expect(error.details).toBeUndefined();
        } else {
          expect(error.message).toBe('Invalid request body');
          expect(
            (error.details as { issues: { path: string; code: string }[] }).issues.map(
              ({ path, code }) => ({ path, code }),
            ),
          ).toEqual(
            parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
          );
        }
        expect(await state()).toEqual(before);
      },
    );
    it.each(corpus.semantic)(
      `${form} evaluates schema-accepted $variant $id through its business rules`,
      async (item) => {
        const variant = corpus.variants.find((row) => row.variant === item.variant)!;
        const body = bodyFor(variant, item, adminMembershipId, countingStationId),
          parsed = schema(variant.schemaName).parse(body);
        const before = await state(),
          original = await read();
        const absent =
          item.category === 'absent-membership-resource-refusal' ||
          item.expectedEffect === 'actual-absent-station-refusal-only';
        const badCidr = item.category === 'business-cidr-refinement-refusal';
        const stale = item.id === 'expectedVersion:positive-integer';
        if (absent || badCidr || stale) {
          const response = await send(variant, form, body).expect(absent ? 404 : stale ? 409 : 400);
          expect(contracts.ErrorBody.parse(response.body).error.code).toBe(
            absent
              ? contracts.ERROR_CODES.NOT_FOUND
              : stale
                ? contracts.ERROR_CODES.SETTING_VERSION_CONFLICT
                : contracts.ERROR_CODES.VALIDATION_FAILED,
          );
          expect(await state()).toEqual(before);
          return;
        }
        const response = await send(variant, form, body).expect(200);
        if (variant.method === 'POST') {
          const result = contracts.TestAttendanceNetworkResponse.parse(response.body);
          expect(result.ip).not.toBeNull();
          expect(isIP(result.ip!)).toBeGreaterThan(0);
          expect(result.trusted).toBe(false);
          expect(response.headers['cache-control']).toBe('no-store');
          expect(await state()).toEqual(before);
          return;
        }
        const key = String(parsed.key),
          isAttendance = family === 'attendance';
        const actual = isAttendance
          ? contracts.AttendanceConfig.parse(response.body)
          : contracts.EventSettingsResponse.parse(response.body);
        const field = key === 'attendance.rootMembershipId' ? 'rootMembershipId' : 'campusCidrs';
        if ('settings' in actual) {
          expect(actual.settings[key as keyof typeof actual.settings]).toEqual(parsed.value);
          expect(actual.versions[key as keyof typeof actual.versions]).toBe(1);
        } else {
          expect(actual[field]).toEqual(parsed.value);
          expect(actual.versions[field]).toBe(1);
        }
        const after = await state();
        expect(after.history).toHaveLength(before.history.length + 1);
        expect(after.audits).toHaveLength(before.audits.length + 1);
        expect(after.receipts).toEqual(before.receipts);
        expect(after.visitors).toEqual(before.visitors);
        expect(after.memberships).toEqual(before.memberships);
        expect(after.stations).toEqual(before.stations);
        expect(after.events).toEqual(before.events);
        const stored = after.settings.find((row) => row.key === key)!;
        expect(stored.value).toEqual(parsed.value);
        expect(stored.version).toBe(1);
        expect(after.history.at(-1)).toMatchObject({
          key,
          version: 1,
          source: 'USER',
          after: parsed.value,
          reason: parsed.reason ?? null,
        });
        const writtenAudit = after.audits.filter(
          (row) => !before.audits.some((previous) => previous.id === row.id),
        );
        expect(writtenAudit).toHaveLength(1);
        expect(writtenAudit[0]).toMatchObject({
          action: 'setting.change',
          entityType: 'Setting',
          entityId: key,
        });
        if (isAttendance) {
          expect(writtenAudit[0]!.before).toMatchObject({ value: '[redacted]' });
          expect(writtenAudit[0]!.after).toMatchObject({ value: '[redacted]', version: 1 });
        }
        const retry = await send(variant, form, body).expect(409);
        expect(retry.body.error.code).toBe(contracts.ERROR_CODES.SETTING_VERSION_CONFLICT);
        expect(await state()).toEqual(after);
        const value =
          'settings' in original
            ? original.settings[key as keyof typeof original.settings]
            : original[field];
        const restored = await send(variant, form, {
          key,
          value: value as Value,
          expectedVersion: 1,
          ...(isAttendance ? {} : { reason: 'Restore original synthetic value' }),
        }).expect(200);
        if ('settings' in original) {
          const restoredValue = contracts.EventSettingsResponse.parse(restored.body);
          expect(restoredValue.settings).toEqual(original.settings);
          expect(restoredValue.versions[key as keyof typeof restoredValue.versions]).toBe(2);
        } else {
          const restoredValue = contracts.AttendanceConfig.parse(restored.body);
          expect(restoredValue[field]).toEqual(original[field]);
          expect(restoredValue.versions[field]).toBe(2);
        }
        const final = await state();
        expect(final.history).toHaveLength(before.history.length + 2);
        expect(final.audits).toHaveLength(before.audits.length + 2);
        expect(final.receipts).toEqual(before.receipts);
        expect(final.visitors).toEqual(before.visitors);
        expect(final.memberships).toEqual(before.memberships);
        expect(final.stations).toEqual(before.stations);
        expect(final.events).toEqual(before.events);
      },
    );
  }
  if (family === 'attendance') {
    it.each(['scoped', 'alias'])(
      'owned-root %s stores the real active admin and restores the original value with a new version',
      async (form) => {
        const variant = corpus.variants.find((row) => row.variant === 'root')!,
          before = await state();
        const saved = await send(variant, form, {
          key: 'attendance.rootMembershipId',
          value: adminMembershipId,
          expectedVersion: 0,
        }).expect(200);
        expect(contracts.AttendanceConfig.parse(saved.body)).toMatchObject({
          rootMembershipId: adminMembershipId,
          rootIsStale: false,
          versions: { rootMembershipId: 1 },
        });
        const after = await state();
        expect(after.history).toHaveLength(before.history.length + 1);
        expect(after.audits).toHaveLength(before.audits.length + 1);
        expect(after.receipts).toEqual(before.receipts);
        const rootAudit = after.audits.filter(
          (row) => !before.audits.some((previous) => previous.id === row.id),
        );
        expect(rootAudit[0]).toMatchObject({
          action: 'setting.change',
          entityId: 'attendance.rootMembershipId',
          before: { value: '[redacted]' },
          after: { value: '[redacted]', version: 1 },
        });
        const stale = await send(variant, form, {
          key: 'attendance.rootMembershipId',
          value: adminMembershipId,
          expectedVersion: 0,
        }).expect(409);
        expect(stale.body.error.code).toBe(contracts.ERROR_CODES.SETTING_VERSION_CONFLICT);
        expect(await state()).toEqual(after);
        const restored = await send(variant, form, {
          key: 'attendance.rootMembershipId',
          value: null,
          expectedVersion: 1,
        }).expect(200);
        expect(contracts.AttendanceConfig.parse(restored.body)).toMatchObject({
          rootMembershipId: null,
          rootIsStale: false,
          versions: { rootMembershipId: 2 },
        });
        const final = await state();
        expect(final.history).toHaveLength(before.history.length + 2);
        expect(final.audits).toHaveLength(before.audits.length + 2);
        expect(final.receipts).toEqual(before.receipts);
        const restoredAudit = final.audits.filter(
          (row) => !after.audits.some((previous) => previous.id === row.id),
        );
        expect(restoredAudit[0]).toMatchObject({
          action: 'setting.change',
          entityId: 'attendance.rootMembershipId',
          before: { value: '[redacted]' },
          after: { value: '[redacted]', version: 2 },
        });
        expect(final.events).toEqual(before.events);
        expect(final.memberships).toEqual(before.memberships);
        expect(final.visitors).toEqual(before.visitors);
        expect(final.stations).toEqual(before.stations);
      },
    );
    for (const form of ['scoped', 'alias'])
      for (const target of ['same-event-nonadmin', 'foreign-active-admin'])
        it(`root-resource ${form} refuses actual ${target} without a version, history or receipt effect`, async () => {
          const variant = corpus.variants.find((row) => row.variant === 'root')!;
          const person = await createVolunteer({
            email: 'synthetic-p16-root-resource@example.test',
            role: target === 'same-event-nonadmin' ? 'IC' : 'ADMIN',
          });
          let member = await rawDb.eventMembership.findUniqueOrThrow({
            where: { eventId_personId: { eventId, personId: person.id } },
          });
          if (target === 'foreign-active-admin') {
            const home = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
            const other = await createEvent({
              organisationId: home.organisationId,
              slug: 'synthetic-root-foreign',
              name: 'Synthetic root foreign event',
              timezone: home.timezone,
              status: 'DRAFT',
              categories: [],
              stationTypes: [],
              shiftTemplates: [],
            });
            await rawDb.event.update({
              where: { id: other.id },
              data: { createdAt: new Date(home.createdAt.getTime() + 1000) },
            });
            member = await rawDb.eventMembership.update({
              where: { id: member.id },
              data: { eventId: other.id },
            });
          }
          const body = { key: 'attendance.rootMembershipId', value: member.id, expectedVersion: 0 };
          contracts.ChangeAttendanceConfigRequest.parse(body);
          const before = await state(),
            response = await send(variant, form, body).expect(
              target === 'same-event-nonadmin' ? 400 : 404,
            );
          expect(response.body.error.code).toBe(
            target === 'same-event-nonadmin'
              ? contracts.ERROR_CODES.VALIDATION_FAILED
              : contracts.ERROR_CODES.NOT_FOUND,
          );
          expect(await state()).toEqual(before);
        });
  }
  return { app, current: () => ({ eventId, token, adminId }) };
}

export function registerSettingsReadCases(
  family: 'attendance' | 'product',
  context: SettingsContext,
): void {
  const path = family === 'attendance' ? '/admin/attendance-settings' : '/admin/event-settings';
  const matrix = JSON.parse(
    readFileSync(new URL('../integration/route-role-matrix.json', import.meta.url), 'utf8'),
  ) as Record<string, { asks: string; who: contracts.CommitteeRole[] | 'every member' }>;
  const permission = matrix['GET ' + path]!;
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
  const cases = ['scoped', 'alias'].flatMap((form) => kinds.map((kind) => ({ form, kind })));
  afterEach(async () => {
    await settleDenials();
    vi.setSystemTime(FROZEN_NOW);
  });
  it.each(cases)(
    'read-role $form $kind has the exact read/scope refusal and audit effects',
    async (item) => {
      const { app } = context,
        current = context.current();
      let access: string | undefined = current.token,
        personId = current.adminId;
      const foreign = item.kind === 'FOREIGN',
        authentication = ['missing', 'actual-expired', 'forged'].includes(item.kind);
      const role = (
        foreign ? 'VOLUNTEER' : authentication ? 'ADMIN' : item.kind
      ) as contracts.CommitteeRole;
      if (!authentication && item.kind !== 'ADMIN') {
        const person = await createVolunteer({
          email: 'synthetic-p16-settings-read@example.test',
          role,
        });
        personId = person.id;
        if (foreign) {
          const home = await rawDb.event.findUniqueOrThrow({ where: { id: current.eventId } });
          const other = await createEvent({
            organisationId: home.organisationId,
            slug: 'synthetic-settings-foreign',
            name: 'Synthetic settings foreign event',
            timezone: home.timezone,
            status: 'DRAFT',
            categories: [],
            stationTypes: [],
            shiftTemplates: [],
          });
          await rawDb.event.update({
            where: { id: other.id },
            data: { createdAt: new Date(home.createdAt.getTime() + 1000) },
          });
          await rawDb.eventMembership.updateMany({
            where: { eventId: home.id, personId },
            data: { eventId: other.id },
          });
          const opened = await request(app)
            .post('/api/v1/auth/session')
            .set('Origin', 'http://localhost:3000')
            .send({ providerAccessToken: person.token })
            .expect(201);
          access = opened.body.accessToken as string;
          const own = await request(app)
            .get(`/api/v1/events/${other.id}/me`)
            .set('Authorization', 'Bearer ' + access)
            .expect(200);
          expect(contracts.MeResponse.parse(own.body)).toMatchObject({
            event: { id: other.id },
            volunteer: { id: personId, role },
          });
          const ownSettings = await request(app)
            .get(`/api/v1/events/${other.id}/admin/event-settings`)
            .set('Authorization', 'Bearer ' + access)
            .expect(200);
          contracts.EventSettingsResponse.parse(ownSettings.body);
        } else {
          const opened = await request(app)
            .post('/api/v1/auth/session')
            .set('Origin', 'http://localhost:3000')
            .send({ providerAccessToken: person.token })
            .expect(201);
          access = opened.body.accessToken as string;
        }
      }
      if (item.kind === 'missing') access = undefined;
      if (item.kind === 'actual-expired')
        vi.setSystemTime(new Date(decodeJwt(current.token).exp! * 1000 + 2000));
      if (item.kind === 'forged') {
        const parts = current.token.split('.'),
          signature = Buffer.from(parts[2]!, 'base64url');
        signature[0] = signature[0]! ^ 1;
        access = parts.slice(0, 2).join('.') + '.' + signature.toString('base64url');
      }
      if (!authentication) {
        const alias = await request(app)
          .get('/api/v1/me')
          .set('Authorization', 'Bearer ' + access)
          .expect(foreign ? 403 : 200);
        if (foreign) expect(alias.body.error.code).toBe(contracts.ERROR_CODES.NOT_PROVISIONED);
        else
          expect(contracts.MeResponse.parse(alias.body)).toMatchObject({
            event: { id: current.eventId },
            volunteer: { id: personId, role },
          });
      }
      const allowed = permission.who === 'every member' || permission.who.includes(role);
      const expected = authentication
        ? 401
        : foreign
          ? item.form === 'scoped'
            ? 404
            : 403
          : allowed
            ? 200
            : 403;
      const before = await state(),
        pattern = (item.form === 'scoped' ? '/api/v1/events/:eventId' : '/api/v1') + path;
      let pending = request(app).get(
        (item.form === 'scoped' ? `/api/v1/events/${current.eventId}` : '/api/v1') + path,
      );
      if (access) pending = pending.set('Authorization', 'Bearer ' + access);
      const response = await pending.expect(expected);
      if (expected === 200) {
        if (family === 'attendance') {
          contracts.AttendanceConfig.parse(response.body);
          expect(response.headers['cache-control']).toBe('no-store');
        } else contracts.EventSettingsResponse.parse(response.body);
      } else {
        const error = contracts.ErrorBody.parse(response.body).error;
        expect(error.code).toBe(
          authentication
            ? contracts.ERROR_CODES.UNAUTHENTICATED
            : foreign
              ? item.form === 'scoped'
                ? contracts.ERROR_CODES.NOT_FOUND
                : contracts.ERROR_CODES.NOT_PROVISIONED
              : contracts.ERROR_CODES.FORBIDDEN,
        );
        if (!foreign && !authentication)
          expect(error.details).toEqual({ actions: [permission.asks] });
        else expect(error.details).toBeUndefined();
      }
      await settleDenials();
      const after = await state();
      if (expected === 403 && !foreign && !authentication) {
        const added = after.audits.filter((row) => !before.audits.some((old) => old.id === row.id));
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({
          action: 'authorization.denied',
          actorId: personId,
          actorSub: decodeJwt(access!).sub,
          eventId: current.eventId,
          entityType: 'Route',
          entityId: 'GET ' + pattern,
          path: pattern,
          method: 'GET',
          statusCode: 403,
          outcome: 'DENIED',
          severity: 'WARNING',
          requestId: response.body.error.requestId,
          after: { actions: [permission.asks] },
        });
        expect({
          ...after,
          audits: after.audits.filter((row) => before.audits.some((old) => old.id === row.id)),
        }).toEqual(before);
      } else expect(after).toEqual(before);
      if (authentication) {
        vi.setSystemTime(FROZEN_NOW);
        const control = await request(app)
          .get(`/api/v1/events/${current.eventId}/me`)
          .set('Authorization', 'Bearer ' + current.token)
          .expect(200);
        expect(contracts.MeResponse.parse(control.body).volunteer.id).toBe(current.adminId);
      }
    },
  );
}
