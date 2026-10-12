import { describe, expect, it } from 'vitest';
import { deliveryDeadline, preferenceAllows, pushKind } from '../../src/modules/notification/domain/noticeDelivery.js';
import { noticePushOutcome } from '../../src/modules/notification/domain/noticeOutcome.js';

const now = new Date('2030-03-04T01:00:00Z');
describe('durable notice delivery rules', () => {
  it('keeps urgent announcements on their original worker, allows explicit operational and never pushes INFO', () => {
    expect(pushKind('ANNOUNCEMENT_PUBLISHED', 'URGENT')).toBeNull();
    expect(pushKind('ANNOUNCEMENT_PUBLISHED', 'OPERATIONAL')).toBe('announcement.operational');
    expect(pushKind('LOST_PERSON_RAISED', 'INFO')).toBeNull();
    expect(pushKind('INCIDENT_RAISED', 'URGENT')).toBe('incident.critical');
  });
  it.each([
    ['URGENT', { urgentPush: true, operationalPush: false }, true],
    ['OPERATIONAL', { urgentPush: true, operationalPush: false }, false],
    ['URGENT', { urgentPush: false, operationalPush: true }, false],
    ['OPERATIONAL', { urgentPush: false, operationalPush: true }, true],
    ['INFO', { urgentPush: true, operationalPush: true }, false],
  ] as const)('uses %s person preference without changing centre storage', (priority, preference, expected) => {
    expect(preferenceAllows(priority, preference)).toBe(expected);
  });
  it('bounds the immutable delivery deadline by both the source expiry and per-kind TTL', () => {
    expect(deliveryDeadline({ createdAt: now, ttlSeconds: 600, expiresAt: new Date(now.getTime() + 3000) }))
      .toEqual(new Date(now.getTime() + 3000));
    expect(deliveryDeadline({ createdAt: now, ttlSeconds: 600 })).toEqual(new Date(now.getTime() + 600000));
  });
  it.each([
    ['ACCEPTED', 'SENT', null], ['GONE', 'SKIPPED', 'SUBSCRIPTION_GONE'],
    ['UNCONFIGURED', 'SKIPPED', 'UNCONFIGURED'],
  ] as const)('settles %s with a fixed outcome', (result, status, lastError) => {
    expect(noticePushOutcome(result, { now, expiresAt: new Date(now.getTime() + 600000), attempts: 1, maxAttempts: 5 }))
      .toEqual({ status, lastError });
  });
  it('retries bounded failures but never runs at or beyond the immutable deadline', () => {
    expect(noticePushOutcome('FAILED', { now, expiresAt: new Date(now.getTime() + 600000), attempts: 1, maxAttempts: 5 }))
      .toEqual({ status: 'PENDING', lastError: 'PUSH_FAILED', runAt: new Date(now.getTime() + 30000) });
    expect(noticePushOutcome('FAILED', { now, expiresAt: new Date(now.getTime() + 30000), attempts: 1, maxAttempts: 5 }))
      .toEqual({ status: 'SKIPPED', lastError: 'EXPIRED' });
    expect(noticePushOutcome('FAILED', { now, expiresAt: new Date(now.getTime() + 600000), attempts: 5, maxAttempts: 5 }))
      .toEqual({ status: 'DEAD', lastError: 'PUSH_FAILED' });
  });
});
