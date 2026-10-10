import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { FullReport } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { lifecycleSnapshot } from '../../src/modules/event/application/lifecycleSnapshot.js';
import { lockLifecycleEvent } from '../../src/modules/event/data/lifecycleRepo.js';
import { evaluateTransition } from '../../src/modules/event/domain/lifecycle.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
  renewFixtureToken,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';
import { insertArchiveExportFixture } from '../helpers/content.js';

const app = createApp();
const transactionDb = rawDb.$extends({ query: {} });
const AFTER_GRACE = new Date(FROZEN_NOW.getTime() + 24 * 3600_000 + 1);
let eventId: string;
let organisationId: string;
let admin: TestVolunteer;
let fixtureNumber = 0;

async function readiness(now = AFTER_GRACE, id = eventId) {
  return transactionDb.$transaction(async (tx) => {
    const scope = { eventId: id };
    const event = await lockLifecycleEvent(tx, scope);
    const snapshot = await lifecycleSnapshot(tx, scope, { event, now });
    return {
      facts: snapshot.archive,
      decision: evaluateTransition(snapshot, 'ARCHIVED', { now, platformAdmin: true }),
    };
  });
}

beforeEach(async () => {
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({
    email: `archive-${fixtureNumber++}@readiness.test`,
    role: 'ADMIN',
  });
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  organisationId = event.organisationId;
  const closed = await request(app)
    .post(`/api/v1/events/${eventId}/lifecycle`)
    .set('Authorization', bearer(admin))
    .send({
      to: 'CLOSED',
      expectedVersion: event.lifecycleVersion,
      idempotencyKey: idempotencyKey(),
    });
  expect(closed.status).toBe(200);
  await insertArchiveExportFixture({ db: rawDb, eventId, now: FROZEN_NOW });
});

const resolvedData = (rehearsal = false) => ({
  eventId,
  rehearsal,
  raisedById: admin.id,
  status: 'RESOLVED_FOUND' as const,
  raisedAt: FROZEN_NOW,
  resolvedAt: FROZEN_NOW,
});

it('accepts a valid current final report after grace with no outstanding resolved purge', async () => {
  expect(await readiness()).toMatchObject({
    facts: {
      lostPersonPurgeComplete: true,
      finalReportExists: true,
      captureGracePeriodComplete: true,
    },
    decision: { allowed: true, blockers: [] },
  });
  vi.setSystemTime(AFTER_GRACE);
  await renewFixtureToken(admin);
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  await rawDb.organisationMembership.create({
    data: { organisationId, personId: admin.id, role: 'PLATFORM_ADMIN' },
  });
  const response = await request(app)
    .post(`/api/v1/events/${eventId}/lifecycle`)
    .set('Authorization', bearer(admin))
    .send({
      to: 'ARCHIVED',
      expectedVersion: event.lifecycleVersion,
      idempotencyKey: idempotencyKey(),
    });
  expect(response.status).toBe(200);
  expect(await rawDb.eventMembership.count({ where: { eventId, status: 'ACTIVE' } })).toBe(0);
});

it.each([-1, 0, 1])('requires expiry strictly after the grace boundary (%i ms)', async (offset) => {
  const result = await readiness(new Date(FROZEN_NOW.getTime() + 24 * 3600_000 + offset));
  expect(result.facts.captureGracePeriodComplete).toBe(offset > 0);
  expect(result.decision.blockers).toEqual(offset > 0 ? [] : ['capture-grace-period']);
});

it.each([1, 72])('uses the full resolved %i-hour event grace', async (hours) => {
  await rawDb.setting.create({
    data: {
      scope: 'EVENT',
      scopeId: eventId,
      eventId,
      key: 'capture.lateSyncHours',
      value: hours,
      version: 1,
    },
  });
  const boundary = FROZEN_NOW.getTime() + hours * 3600_000;
  expect((await readiness(new Date(boundary))).facts.captureGracePeriodComplete).toBe(false);
  expect((await readiness(new Date(boundary + 1))).facts.captureGracePeriodComplete).toBe(true);
});

it('ignores unsupported platform grace and uses the default for a malformed event override', async () => {
  await rawDb.setting.create({
    data: {
      scope: 'PLATFORM',
      scopeId: organisationId,
      key: 'capture.lateSyncHours',
      value: 48,
      version: 1,
    },
  });
  expect((await readiness()).facts.captureGracePeriodComplete).toBe(true);
  await rawDb.setting.create({
    data: {
      scope: 'EVENT',
      scopeId: eventId,
      eventId,
      key: 'capture.lateSyncHours',
      value: -9,
      version: 1,
    },
  });
  expect((await readiness()).facts.captureGracePeriodComplete).toBe(true);
  expect(
    (await readiness(new Date(FROZEN_NOW.getTime() + 48 * 3600_000 + 1))).facts
      .captureGracePeriodComplete,
  ).toBe(true);
});

it.each([null, new Date(AFTER_GRACE.getTime() + 1)])(
  'refuses missing/future close time %s',
  async (closedAt) => {
    await rawDb.event.update({ where: { id: eventId }, data: { closedAt } });
    expect((await readiness()).facts.captureGracePeriodComplete).toBe(false);
  },
);

it.each(['RESOLVED_FOUND', 'RESOLVED_OTHER'] as const)(
  'requires both live and practice %s alerts to have been purged',
  async (status) => {
    for (const rehearsal of [false, true]) {
      const alert = await rawDb.lostPersonAlert.create({
        data: { ...resolvedData(rehearsal), status },
      });
      expect((await readiness()).decision.blockers).toEqual(['lost-person-purge']);
      await rawDb.lostPersonAlert.update({
        where: { eventId, id: alert.id },
        data: { purgedAt: FROZEN_NOW },
      });
      expect((await readiness()).decision.allowed).toBe(true);
    }
  },
);

it.each(['approxAge', 'descriptionText', 'clothingText'] as const)(
  'refuses an inconsistent purge marker with remaining %s',
  async (field) => {
    await rawDb.lostPersonAlert.create({
      data: { ...resolvedData(), purgedAt: FROZEN_NOW, [field]: 'Transient description' },
    });
    expect((await readiness()).decision.blockers).toEqual(['lost-person-purge']);
  },
);

it('reads purge evidence from the supplied transaction and does not invent an active-alert blocker', async () => {
  await transactionDb.$transaction(async (tx) => {
    const scope = { eventId };
    const event = await lockLifecycleEvent(tx, scope);
    const alert = await tx.lostPersonAlert.create({ data: resolvedData() });
    expect(
      (await lifecycleSnapshot(tx, scope, { event, now: AFTER_GRACE })).archive
        .lostPersonPurgeComplete,
    ).toBe(false);
    await tx.lostPersonAlert.update({
      where: { eventId, id: alert.id },
      data: { purgedAt: FROZEN_NOW },
    });
    await tx.lostPersonAlert.create({
      data: {
        ...resolvedData(),
        status: 'ACTIVE',
        resolvedAt: null,
        descriptionText: 'Active search',
      },
    });
    expect(
      (await lifecycleSnapshot(tx, scope, { event, now: AFTER_GRACE })).archive
        .lostPersonPurgeComplete,
    ).toBe(true);
  });
});

async function otherClosed() {
  return rawDb.event.create({
    data: {
      organisationId,
      slug: 'other-archive',
      name: 'Other archive',
      timezone: 'Asia/Singapore',
      status: 'CLOSED',
      closedAt: FROZEN_NOW,
    },
  });
}

it('does not use another event’s final report or purge/grace setting', async () => {
  const other = await otherClosed();
  await rawDb.lostPersonAlert.create({ data: { ...resolvedData(), eventId: other.id } });
  await rawDb.setting.create({
    data: {
      scope: 'EVENT',
      scopeId: other.id,
      eventId: other.id,
      key: 'capture.lateSyncHours',
      value: 72,
      version: 1,
    },
  });
  expect((await readiness()).decision.allowed).toBe(true);
  expect((await readiness(AFTER_GRACE, other.id)).decision.blockers).toEqual([
    'lost-person-purge',
    'final-report',
    'capture-grace-period',
    'final-export',
  ]);
});

it.each([
  'malformed',
  'practice',
  'range',
  'wrong-phase',
  'stale-version',
  'superseded',
  'daily',
] as const)('refuses a %s document as final close-out evidence', async (kind) => {
  const source = await rawDb.reportSnapshot.findFirstOrThrow({ where: { eventId, kind: 'FINAL' } });
  const other = await otherClosed();
  const report = FullReport.parse(source.report);
  const document =
    kind === 'malformed'
      ? {}
      : {
          ...report,
          ...(kind === 'practice' ? { rehearsalIncluded: true } : {}),
          ...(kind === 'range' ? { range: { from: FROZEN_NOW.toISOString(), to: null } } : {}),
          ...(kind === 'wrong-phase' ? { event: { ...report.event, status: 'LIVE' } } : {}),
        };
  const version = other.lifecycleVersion + (kind === 'stale-version' ? 1 : 0);
  await rawDb.reportSnapshot.create({
    data: {
      eventId: other.id,
      kind: kind === 'daily' ? 'DAILY' : 'FINAL',
      lifecycleVersion: version,
      dedupeKey: kind === 'daily' ? 'daily:test' : `final:${version}`,
      report: document,
      createdAt: FROZEN_NOW,
      ...(kind === 'superseded' ? { supersededAt: AFTER_GRACE } : {}),
    },
  });
  expect((await readiness(AFTER_GRACE, other.id)).decision.blockers).toEqual([
    'final-report',
    'final-export',
  ]);
});

it('requires a fresh close-out snapshot after reopen and reclose', async () => {
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE', closedAt: null } });
  expect((await readiness()).facts).toEqual({
    lostPersonPurgeComplete: false,
    finalReportExists: false,
    captureGracePeriodComplete: false,
    lostFoundClosed: false,
    fallbackWindowsClosed: false,
    exportPackExists: false,
  });
  await rawDb.event.update({
    where: { id: eventId },
    data: { status: 'CLOSED', closedAt: FROZEN_NOW },
  });
  expect((await readiness()).decision.blockers).toEqual(['final-report', 'final-export']);
});
