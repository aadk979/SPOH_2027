import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { reserveIdentityDeliveries } from '../../src/platform/identity/deliveryQuota.js';
import { prisma } from '../../src/platform/db/client.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

beforeEach(async () => {
  await resetDatabase();
  await createVolunteer({ email: 'quota@example.test', role: 'VOLUNTEER' });
});
afterEach(() => { env.AUTH_PROVIDER = 'local'; });

describe('shared default Cognito sender quota', () => {
  it('allows exactly fifty simultaneous deliveries across instances and keeps no recipient data', async () => {
    env.AUTH_PROVIDER = 'cognito';
    const scope = await testEvent();
    const attempts = await Promise.allSettled(Array.from({ length: 7 }, () =>
      prisma.$transaction((tx) => reserveIdentityDeliveries(tx, { scope, count: 10, now: FROZEN_NOW }))));
    expect(attempts.filter((entry) => entry.status === 'fulfilled')).toHaveLength(5);
    const row = await rawDb.identityDeliveryQuota.findFirstOrThrow();
    expect(row.used).toBe(50);
    expect(JSON.stringify(row)).not.toContain('quota@example.test');
    const failures = attempts.filter((entry) => entry.status === 'rejected');
    expect(failures).toHaveLength(2);
    expect(failures[0]).toMatchObject({ reason: { statusCode: 429 } });
  });
  it('shares the pool allowance across events and opens a new UTC-day window', async () => {
    env.AUTH_PROVIDER = 'cognito';
    const scope = await testEvent();
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: scope.eventId } });
    const other = await rawDb.event.create({ data: { organisationId: event.organisationId, slug: 'quota-other', name: 'Other', timezone: event.timezone } });
    await prisma.$transaction((tx) => reserveIdentityDeliveries(tx, { scope, count: 50, now: FROZEN_NOW }));
    await expect(prisma.$transaction((tx) => reserveIdentityDeliveries(tx, { scope: { eventId: other.id }, count: 1, now: FROZEN_NOW }))).rejects.toMatchObject({ statusCode: 429 });
    await prisma.$transaction((tx) => reserveIdentityDeliveries(tx, { scope, count: 1, now: new Date(FROZEN_NOW.getTime() + 86400000) }));
    expect(await rawDb.identityDeliveryQuota.count()).toBe(2);
  });
  it('does not count identity-free local fixtures or zero-delivery account reuse', async () => {
    const scope = await testEvent();
    await prisma.$transaction((tx) => reserveIdentityDeliveries(tx, { scope, count: 100, now: FROZEN_NOW }));
    env.AUTH_PROVIDER = 'cognito';
    await prisma.$transaction((tx) => reserveIdentityDeliveries(tx, { scope, count: 0, now: FROZEN_NOW }));
    expect(await rawDb.identityDeliveryQuota.count()).toBe(0);
  });
});

describe('fixed database audit retention', () => {
  it('purges only expired platform rows and expired archives, keeping running-event history', async () => {
    const [clock] = await rawDb.$queryRaw<{ now: Date }[]>`SELECT CURRENT_TIMESTAMP AS now`;
    expect(clock).toBeDefined();
    const now = clock!.now;
    const old = new Date(now.getTime() - 401 * 86400000);
    const recent = new Date(now.getTime() - 399 * 86400000);
    const scope = await testEvent();
    const live = await rawDb.event.findUniqueOrThrow({ where: { id: scope.eventId } });
    const archive = await rawDb.event.create({ data: { organisationId: live.organisationId,
      slug: 'expired-audit', name: 'Expired', timezone: live.timezone, status: 'ARCHIVED', archivedAt: old } });
    await rawDb.auditLog.createMany({ data: [
      { id: 'expired-platform', action: 'test', entityType: 'Test', createdAt: old },
      { id: 'recent-platform', action: 'test', entityType: 'Test', createdAt: recent },
      { id: 'running-history', eventId: scope.eventId, action: 'test', entityType: 'Test', createdAt: old },
      { id: 'expired-archive', eventId: archive.id, action: 'test', entityType: 'Test', createdAt: old },
      { id: 'recent-archive', eventId: archive.id, action: 'test', entityType: 'Test', createdAt: recent },
    ] });
    const first = await rawDb.$queryRaw<{ removed: number }[]>`SELECT public.prune_expired_audit() AS removed`;
    expect(first[0]?.removed).toBe(2);
    const rows = await rawDb.auditLog.findMany({ where: { action: 'test' }, orderBy: { id: 'asc' } });
    expect(rows.map((row) => row.id)).toEqual(['recent-archive', 'recent-platform', 'running-history']);
    const second = await rawDb.$queryRaw<{ removed: number }[]>`SELECT public.prune_expired_audit() AS removed`;
    expect(second[0]?.removed).toBe(0);
  });
});
