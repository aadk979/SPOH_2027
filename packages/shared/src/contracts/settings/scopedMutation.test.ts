import { expect, it } from 'vitest';
import { GENERATED_SETTING_DEFAULTS } from '../../generated/settings/index.js';
import { ScopedSettingsMutationRequest, ScopedSettingsMutationResponse } from './scopedMutation.js';
import { scopedOperationalKeys } from './scopedRead.js';

const request = {
  operation: 'set',
  target: { scope: 'event' },
  key: 'silentStationMinutes',
  value: 20,
  expectedVersion: 0,
  reason: 'Reviewed setting',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
};
const current = (scope: 'event' | 'station' = 'event') => ({
  eventId: 'synthetic-event',
  target: scope === 'event' ? { scope } : { scope, stationId: 'station' },
  eventStatus: 'READY',
  evaluatedAt: '2027-01-01T00:00:00Z',
  data: scopedOperationalKeys(scope).map((key) => ({
    key,
    value: GENERATED_SETTING_DEFAULTS[key],
    source: { scope: 'default', version: 0 },
    storedVersion: 0,
    invalidScopes: [],
  })),
});
it('accepts bounded registered set values and normalises the authored schema and reason', () => {
  expect(
    ScopedSettingsMutationRequest.parse({
      ...request,
      key: 'vocabulary.missionCard',
      value: '  Journey card  ',
      reason: '  Reviewed setting  ',
    }),
  ).toMatchObject({ value: 'Journey card', reason: 'Reviewed setting' });
  for (const input of [
    { key: 'capture.open', value: false },
    { key: 'incident.pushSeverities', value: ['HIGH', 'CRITICAL'] },
    { key: 'implausibleTapsPerMinute', value: 2.5 },
  ])
    expect(ScopedSettingsMutationRequest.safeParse({ ...request, ...input }).success).toBe(true);
});
it('permits station keys only with an explicit owned-target shape', () => {
  const target = { scope: 'station', stationId: 'station' };
  expect(ScopedSettingsMutationRequest.safeParse({ ...request, target }).success).toBe(true);
  for (const patch of [
    { target: {} },
    { target: { scope: 'station' } },
    { target: { scope: 'platform' } },
    { target: { scope: 'event', stationId: 'station' } },
    { target: { scope: 'station', stationId: '' } },
    { target, key: 'longShiftMinutes' },
  ])
    expect(ScopedSettingsMutationRequest.safeParse({ ...request, ...patch }).success).toBe(false);
});
it('cannot select guarded product, privacy, security, platform-only or legacy adapter keys', () => {
  for (const key of [
    'product.countsMode',
    'product.visitorDataMode',
    'lostPersonPurgeHours',
    'attendance.rootMembershipId',
    'attendance.campusCidrs',
    'attendance.pinAllowedOffNetwork',
    'auth.accessTokenTtlSeconds',
    'rateLimit.max.default',
    'dashboardPollSeconds',
    'media.maxUploadBytes',
    'eventName',
  ])
    expect(ScopedSettingsMutationRequest.safeParse({ ...request, key }).success).toBe(false);
});
it('refuses malformed values, reviews, reasons, UUIDs, operations and forged fields', () => {
  for (const patch of [
    { value: 0 },
    { value: '20' },
    { value: { private: 'unregistered' } },
    { value: null },
    { key: 'incident.pushSeverities', value: ['UNKNOWN'] },
    { key: 'vocabulary.missionCard', value: 'x'.repeat(41) },
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
    { reason: '  ' },
    { reason: 'x'.repeat(501) },
    { idempotencyKey: 'invalid' },
    { operation: 'revert' },
    { actorId: 'forged' },
    { eventId: 'foreign' },
    { source: 'SCHEDULE' },
    { key: 'unregistered' },
  ])
    expect(ScopedSettingsMutationRequest.safeParse({ ...request, ...patch }).success).toBe(false);
});
it('reset takes a review and reason but no caller-selected value', () => {
  const { value: _value, ...input } = request;
  expect(ScopedSettingsMutationRequest.parse({ ...input, operation: 'reset' }).operation).toBe(
    'reset',
  );
  expect(ScopedSettingsMutationRequest.safeParse({ ...request, operation: 'reset' }).success).toBe(
    false,
  );
});
it('accepts fresh scoped reads on replay even when their current version changed or reset', () => {
  const response = {
    change: { id: 'history', key: 'silentStationMinutes', operation: 'set', version: 1 },
    reviewedVersion: 0,
    current: current(),
  };
  expect(ScopedSettingsMutationResponse.parse(response)).toEqual(response);
  expect(
    ScopedSettingsMutationResponse.safeParse({
      ...response,
      change: { ...response.change, operation: 'reset', version: 3 },
      reviewedVersion: 2,
    }).success,
  ).toBe(true);
});
it('refuses non-advancing history, unsupported scopes and raw historical or identity fields', () => {
  const response = {
    change: { id: 'history', key: 'silentStationMinutes', operation: 'set', version: 1 },
    reviewedVersion: 0,
    current: current(),
  };
  for (const patch of [
    { reviewedVersion: 1 },
    { change: { ...response.change, version: 0 } },
    { current: { ...current(), data: [] } },
    { actorId: 'private' },
    { change: { ...response.change, before: 'private' } },
    { current: current('station'), change: { ...response.change, key: 'longShiftMinutes' } },
  ])
    expect(ScopedSettingsMutationResponse.safeParse({ ...response, ...patch }).success).toBe(false);
});
