import { expect, it } from 'vitest';
import { GENERATED_SETTING_DEFAULTS } from '../../generated/settings/index.js';
import { ScopedSettingsRevertRequest, ScopedSettingsRevertResponse } from './scopedRevert.js';
import { scopedOperationalKeys } from './scopedRead.js';

const request = {
  target: { scope: 'event' },
  key: 'silentStationMinutes',
  historyId: 'selected-history',
  expectedVersion: 0,
  reason: 'Reviewed restore',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
};
const current = (scope: 'event' | 'station' = 'event') => ({
  eventId: 'event',
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
const history = (patch = {}) => ({
  id: 'applied-history',
  key: request.key,
  version: 3,
  source: 'REVERT',
  createdAt: '2027-01-01T00:00:00Z',
  createdByYou: true,
  reason: request.reason,
  values: { available: true, operation: 'set', before: 15, after: 20 },
  ...patch,
});
const response = (patch = {}) => ({
  history: history(),
  current: current(),
  reviewedVersion: 0,
  revertedFrom: { historyId: request.historyId, version: 1, operation: 'set' },
  ...patch,
});

it('accepts exact event/station selections and normalises the reviewed reason', () => {
  expect(
    ScopedSettingsRevertRequest.parse({ ...request, reason: '  Reviewed restore  ' }),
  ).toMatchObject({ reason: request.reason });
  expect(
    ScopedSettingsRevertRequest.safeParse({
      ...request,
      target: { scope: 'station', stationId: 'station' },
    }).success,
  ).toBe(true);
});
it('refuses guarded/private/legacy keys and station-unavailable keys', () => {
  for (const key of [
    'product.countsMode',
    'product.visitorDataMode',
    'attendance.rootMembershipId',
    'attendance.campusCidrs',
    'rateLimit.max.admin',
    'auth.accessTokenTtlSeconds',
    'lostPersonPurgeHours',
    'eventName',
  ])
    expect(ScopedSettingsRevertRequest.safeParse({ ...request, key }).success).toBe(false);
  expect(
    ScopedSettingsRevertRequest.safeParse({
      ...request,
      target: { scope: 'station', stationId: 'station' },
      key: 'longShiftMinutes',
    }).success,
  ).toBe(false);
});
it('refuses caller-selected values/operations/provenance and malformed reviews or targets', () => {
  for (const patch of [
    { value: 20 },
    { operation: 'set' },
    { source: 'REVERT' },
    { actorId: 'forged' },
    { eventId: 'foreign' },
    { revertedFrom: { historyId: 'forged', version: 1 } },
    { historyId: '' },
    { expectedVersion: -1 },
    { expectedVersion: 0.5 },
    { reason: ' ' },
    { reason: 'x'.repeat(501) },
    { idempotencyKey: 'invalid' },
    { target: { scope: 'platform' } },
    { target: { scope: 'station' } },
    { target: { scope: 'event', stationId: 'station' } },
  ])
    expect(ScopedSettingsRevertRequest.safeParse({ ...request, ...patch }).success).toBe(false);
});
it('accepts newly attributed registered restores and reset removal without an after field', () => {
  expect(ScopedSettingsRevertResponse.safeParse(response()).success).toBe(true);
  const reset = response({
    history: history({
      source: 'RESET',
      values: { available: true, operation: 'reset', before: 20 },
    }),
    revertedFrom: { historyId: request.historyId, version: 1, operation: 'reset' },
  });
  expect(ScopedSettingsRevertResponse.safeParse(reset).success).toBe(true);
  expect(
    ScopedSettingsRevertResponse.safeParse({
      ...reset,
      history: history({
        source: 'RESET',
        values: { available: true, operation: 'reset', before: 20, after: 15 },
      }),
    }).success,
  ).toBe(false);
});
it('requires a new record/version and a truthful operation/source with a current actor', () => {
  for (const patch of [
    { reviewedVersion: 3 },
    { reviewedVersion: -1 },
    { revertedFrom: { historyId: 'selected-history', version: 3, operation: 'set' } },
    { revertedFrom: { historyId: 'applied-history', version: 1, operation: 'set' } },
    { revertedFrom: { historyId: 'selected-history', version: 1, operation: 'reset' } },
    { history: history({ source: 'USER' }) },
    { history: history({ createdByYou: false }) },
    { history: history({ reason: null }) },
    { history: history({ reason: ' ' }) },
    { history: history({ values: { available: false } }) },
    { history: history({ values: { available: true, operation: 'set', before: null, after: 0 } }) },
    { current: current('station'), history: history({ key: 'longShiftMinutes' }) },
  ])
    expect(ScopedSettingsRevertResponse.safeParse(response(patch)).success).toBe(false);
});
it('does not accept private actor/scope metadata or forged restore fields in responses', () => {
  for (const patch of [
    { actorPersonId: 'private' },
    { history: { ...history(), actorPersonId: 'private' } },
    {
      revertedFrom: {
        historyId: 'selected-history',
        version: 1,
        operation: 'set',
        scopeId: 'private',
      },
    },
  ])
    expect(ScopedSettingsRevertResponse.safeParse(response(patch)).success).toBe(false);
});
