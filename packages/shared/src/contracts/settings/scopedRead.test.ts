import { expect, it } from 'vitest';
import { GENERATED_SETTING_DEFAULTS } from '../../generated/settings/index.js';
import {
  SCOPED_OPERATIONAL_KEYS,
  scopedOperationalKeys,
  ScopedOperationalSetting,
  ScopedSettingsReadQuery,
  ScopedSettingsReadResponse,
} from './scopedRead.js';

const row = {
  key: 'capture.open',
  value: true,
  source: { scope: 'default', version: 0 },
  storedVersion: 0,
  invalidScopes: [],
};
const response = (scope: 'event' | 'station' = 'event') => ({
  eventId: 'synthetic-event',
  target: scope === 'event' ? { scope } : { scope, stationId: 'synthetic-station' },
  eventStatus: 'DRAFT',
  evaluatedAt: '2027-01-01T00:00:00Z',
  data: scopedOperationalKeys(scope).map((key) => ({
    ...row,
    key,
    value: GENERATED_SETTING_DEFAULTS[key],
  })),
});
it('selects only registered event and station operational keys, excluding guarded values', () => {
  expect(SCOPED_OPERATIONAL_KEYS).toHaveLength(14);
  expect(scopedOperationalKeys('station')).toEqual([
    'capture.open',
    'implausibleTapsPerMinute',
    'silentStationMinutes',
  ]);
  for (const key of [
    'product.countsMode',
    'product.visitorDataMode',
    'eventName',
    'attendance.campusCidrs',
    'auth.accessTokenTtlSeconds',
    'dashboardPollSeconds',
  ])
    expect(ScopedOperationalSetting.safeParse({ ...row, key }).success).toBe(false);
});
it('defaults to event scope and requires a station only for station scope', () => {
  expect(ScopedSettingsReadQuery.parse({})).toEqual({ scope: 'event' });
  expect(ScopedSettingsReadQuery.parse({ scope: 'station', stationId: 'station' })).toEqual({
    scope: 'station',
    stationId: 'station',
  });
  for (const query of [
    { scope: 'station' },
    { stationId: 'station' },
    { scope: 'platform' },
    { eventId: 'foreign' },
    { scope: ['event'] },
    { scope: 'station', stationId: '' },
  ])
    expect(ScopedSettingsReadQuery.safeParse(query).success).toBe(false);
});
it('validates every value using its registered schema without arbitrary JSON or identities', () => {
  for (const invalid of [
    { value: 'true' },
    { value: { personal: 'private' } },
    { actorId: 'private-person' },
    { key: 'staleDeviceMinutes', value: -1 },
    { key: 'incident.pushSeverities', value: ['UNKNOWN'] },
    { key: 'attendance.campusNetworkLabel', value: 'x'.repeat(201) },
  ])
    expect(ScopedOperationalSetting.safeParse({ ...row, ...invalid }).success).toBe(false);
  expect(
    ScopedOperationalSetting.safeParse({
      ...row,
      key: 'incident.pushSeverities',
      value: ['HIGH', 'CRITICAL'],
    }).success,
  ).toBe(true);
});
it('bounds versions and validates permitted unique layers and default provenance', () => {
  for (const patch of [
    { source: { scope: 'default', version: 1 } },
    { source: { scope: 'platform', version: 1 } },
    { source: { scope: 'event', version: -1 } },
    { storedVersion: 1.5 },
    { invalidScopes: ['event', 'event'] },
    { invalidScopes: ['platform'] },
  ])
    expect(ScopedOperationalSetting.safeParse({ ...row, ...patch }).success).toBe(false);
});
it.each(['event', 'station'] as const)('accepts a complete strict %s response', (scope) => {
  expect(ScopedSettingsReadResponse.parse(response(scope))).toEqual(response(scope));
});
it('rejects missing, duplicate, irrelevant and private response fields', () => {
  const valid = response();
  for (const patch of [
    { data: valid.data.slice(1) },
    { data: [valid.data[0], ...valid.data.slice(0, -1)] },
    { actorId: 'private-person' },
    { target: { scope: 'event', stationId: 'station' } },
    { target: { scope: 'station' } },
    { eventStatus: 'UNKNOWN' },
  ])
    expect(ScopedSettingsReadResponse.safeParse({ ...valid, ...patch }).success).toBe(false);
  const station = response('station');
  expect(ScopedSettingsReadResponse.safeParse({ ...station, data: valid.data }).success).toBe(
    false,
  );
});
it('matches selected versions and permits stored malformed overrides with inherited values', () => {
  const valid = response();
  const replace = (patch: object) => ({
    ...valid,
    data: valid.data.map((item) => (item.key === row.key ? { ...item, ...patch } : item)),
  });
  expect(
    ScopedSettingsReadResponse.safeParse(
      replace({ source: { scope: 'event', version: 2 }, storedVersion: 2 }),
    ).success,
  ).toBe(true);
  expect(
    ScopedSettingsReadResponse.safeParse(
      replace({ source: { scope: 'event', version: 2 }, storedVersion: 1 }),
    ).success,
  ).toBe(false);
  expect(ScopedSettingsReadResponse.safeParse(replace({ storedVersion: 2 })).success).toBe(false);
  expect(
    ScopedSettingsReadResponse.safeParse(replace({ storedVersion: 2, invalidScopes: ['event'] }))
      .success,
  ).toBe(true);
});
it('rejects station source or warnings on an event response', () => {
  const valid = response();
  for (const patch of [
    { source: { scope: 'station', version: 2 } },
    { invalidScopes: ['station'] },
  ]) {
    const data = valid.data.map((item) => (item.key === row.key ? { ...item, ...patch } : item));
    expect(ScopedSettingsReadResponse.safeParse({ ...valid, data }).success).toBe(false);
  }
});
