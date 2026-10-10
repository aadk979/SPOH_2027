import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { LifecycleReadinessResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { transitionEventInTransaction } from '../../src/modules/event/application/transitionEvent.js';
import { prisma } from '../../src/platform/db/client.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, idempotencyKey } from '../helpers/fixtures.js';
import {
  localReadinessFixture,
  readinessEffectState,
  type LocalReadinessFixture,
} from '../helpers/localReadiness.js';
import {
  LOCAL_READY_CHECKS,
  MISSING_READY_CHECKS,
  MISSING_READY_BLOCKERS,
} from '../helpers/localReadinessChecks.js';
import { lifecycleNow } from '../helpers/scheduledLifecycle.js';

const app = createApp();
let f: LocalReadinessFixture;
const get = () =>
  request(app)
    .get(`/api/v1/events/${f.eventId}/lifecycle/readiness`)
    .set('Authorization', bearer(f.creator));
const post = (body: object) =>
  request(app)
    .post(`/api/v1/events/${f.eventId}/lifecycle`)
    .set('Authorization', bearer(f.creator))
    .send(body);
const actor = () => ({
  scope: { eventId: f.eventId },
  membershipId: f.membershipId,
  volunteerId: f.creator.id,
  audit: SYSTEM_AUDIT_CONTEXT,
  clock: fixedClock(lifecycleNow),
});
const firstLive = async () => ({
  to: 'LIVE' as const,
  expectedVersion: (await f.state()).lifecycleVersion,
  idempotencyKey: idempotencyKey(),
});

beforeEach(async () => {
  await resetDatabase();
  f = await localReadinessFixture();
  await rawDb.organisationMembership.create({
    data: { organisationId: f.organisationId, personId: f.creator.id, role: 'PLATFORM_ADMIN' },
  });
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'READY' } });
});

it('returns eight passed and three unavailable strict public decisions without disclosing private facts or writing', async () => {
  const before = await readinessEffectState(f);
  const result = await get();
  expect(result.status).toBe(200);
  expect(result.headers['cache-control']).toBe('no-store');
  const response = LifecycleReadinessResponse.parse(result.body);
  expect(response.evaluatedAt).toBe(lifecycleNow.toISOString());
  expect(
    response.goLiveReadiness.filter((item) => item.state === 'passed').map((item) => item.code),
  ).toEqual(LOCAL_READY_CHECKS);
  expect(response.goLiveReadiness.filter((item) => item.state === 'unavailable')).toEqual(
    MISSING_READY_CHECKS.map((code) => ({
      code,
      state: 'unavailable',
      passed: false,
      reasons: ['evidence-unavailable'],
    })),
  );
  expect(response.transitions.find((item) => item.to === 'LIVE')).toEqual({
    to: 'LIVE',
    allowed: false,
    requiresReason: false,
    blockers: MISSING_READY_BLOCKERS,
  });
  const serialized = JSON.stringify(response.goLiveReadiness);
  for (const value of [
    f.rootMember.id,
    f.workerMember.id,
    f.worker.id,
    f.card.id,
    f.gift.id,
    '203.0.113.0/24',
    'Accepted live batch',
  ])
    expect(serialized).not.toContain(value);
  expect(await readinessEffectState(f)).toEqual(before);
});

it.each([null, ...MISSING_READY_CHECKS])(
  'cannot write first LIVE or a receipt by overriding unavailable %s',
  async (code) => {
    const before = await readinessEffectState(f);
    const body = await firstLive();
    const response = await post({
      ...body,
      ...(code
        ? { goLiveOverrides: [{ code, reason: 'Owner reviewed this unavailable requirement' }] }
        : {}),
    });
    expect(response.status).toBe(409);
    expect(response.headers['cache-control']).toBe('no-store');
    for (const blocker of MISSING_READY_BLOCKERS)
      expect(response.body.error.details.blockers).toContain(blocker);
    if (code) expect(response.body.error.details.blockers).toContain(`go-live:${code}:not-failing`);
    else expect(response.body.error.details.blockers).toEqual(MISSING_READY_BLOCKERS);
    expect(await readinessEffectState(f)).toEqual(before);
  },
);

it('manual core uses the same local snapshot and missing evidence guard under its caller transaction', async () => {
  const before = await readinessEffectState(f);
  const requestBody = await firstLive();
  await expect(
    prisma.$transaction((tx) => transitionEventInTransaction(tx, requestBody, actor()), {
      isolationLevel: 'ReadCommitted',
    }),
  ).rejects.toMatchObject({ statusCode: 409, details: { blockers: MISSING_READY_BLOCKERS } });
  expect(await readinessEffectState(f)).toEqual(before);
});

it('a current local failure and its legitimate platform reason cannot waive the missing domains', async () => {
  await rawDb.giftType.update({
    where: { id: f.gift.id, eventId: f.eventId },
    data: { initialStock: 0 },
  });
  const readiness = LifecycleReadinessResponse.parse((await get()).body);
  expect(readiness.goLiveReadiness.find((item) => item.code === 'gift-stock')).toEqual({
    code: 'gift-stock',
    state: 'failed',
    passed: false,
    reasons: ['live-gift-stock-empty'],
  });
  const before = await readinessEffectState(f);
  const result = await post({
    ...(await firstLive()),
    goLiveOverrides: [
      {
        code: 'gift-stock',
        reason: 'Stock shortfall reviewed by the current platform administrator',
      },
    ],
  });
  expect(result.status).toBe(409);
  expect(result.body.error.details.blockers).toEqual(MISSING_READY_BLOCKERS);
  expect(await readinessEffectState(f)).toEqual(before);
});
