import { expect, it } from 'vitest';
import {
  ScopedSettingsHistoryQuery,
  ScopedSettingsHistoryRecord,
  ScopedSettingsHistoryResponse,
} from './scopedHistory.js';

const row = (patch: object = {}) => ({
  id: 'history-a',
  key: 'silentStationMinutes',
  version: 1,
  source: 'USER',
  createdAt: '2027-01-01T00:00:00Z',
  createdByYou: true,
  reason: 'Review threshold',
  values: { available: true, operation: 'set', before: 15, after: 20 },
  ...patch,
});
const response = (patch: object = {}) => ({
  eventId: 'event-a',
  target: { scope: 'event' },
  key: 'silentStationMinutes',
  eventStatus: 'READY',
  evaluatedAt: '2027-01-01T00:00:00Z',
  data: [row()],
  meta: { count: 1, nextCursor: null },
  ...patch,
});

it('accepts bounded event/station history queries and numeric pagination', () => {
  expect(ScopedSettingsHistoryQuery.parse({ key: 'capture.open' })).toEqual({
    key: 'capture.open',
    scope: 'event',
    limit: 50,
  });
  expect(
    ScopedSettingsHistoryQuery.parse({
      key: 'silentStationMinutes',
      scope: 'station',
      stationId: 'station-a',
      limit: '2',
      cursor: 'history-a',
    }),
  ).toMatchObject({ scope: 'station', stationId: 'station-a', limit: 2 });
});
it('rejects forged query fields, guarded keys, unsupported scopes and unbounded pages', () => {
  for (const patch of [
    { key: undefined },
    { scope: 'station' },
    { stationId: 'station-a' },
    { scope: 'platform' },
    { scope: 'station', stationId: 'station-a', key: 'longShiftMinutes' },
    { key: 'product.countsMode' },
    { key: 'product.visitorDataMode' },
    { key: 'attendance.rootMembershipId' },
    { key: 'lostPersonPurgeHours' },
    { key: 'auth.accessTokenTtlSeconds' },
    { key: 'eventName' },
    { limit: 0 },
    { limit: 201 },
    { limit: 1.5 },
    { cursor: '' },
    { eventId: 'foreign' },
    { actorPersonId: 'forged' },
  ])
    expect(
      ScopedSettingsHistoryQuery.safeParse({ key: 'silentStationMinutes', ...patch }).success,
    ).toBe(false);
});
it('validates registered numeric, boolean, text and array historical values', () => {
  for (const [key, before, after] of [
    ['implausibleTapsPerMinute', 2.5, 5.5],
    ['capture.open', true, false],
    ['vocabulary.missionCard', 'Mission Card', 'Journey card'],
    ['incident.pushSeverities', ['HIGH'], ['HIGH', 'CRITICAL']],
  ])
    expect(
      ScopedSettingsHistoryRecord.safeParse(
        row({ key, values: { available: true, operation: 'set', before, after } }),
      ).success,
    ).toBe(true);
  for (const values of [
    { available: true, operation: 'set', before: 0, after: 20 },
    { available: true, operation: 'set', before: 15, after: 0 },
    { available: true, operation: 'set', before: null, after: '20' },
  ])
    expect(ScopedSettingsHistoryRecord.safeParse(row({ values })).success).toBe(false);
});
it('represents reset as removal without an invented after value', () => {
  const reset = row({
    source: 'RESET',
    values: { available: true, operation: 'reset', before: 20 },
  });
  expect(ScopedSettingsHistoryRecord.safeParse(reset).success).toBe(true);
  for (const patch of [
    { source: 'USER' },
    { values: { available: false } },
    { values: { available: true, operation: 'reset', before: 20, after: 15 } },
    { values: { available: true, operation: 'set', before: 20, after: 15 } },
  ])
    expect(ScopedSettingsHistoryRecord.safeParse({ ...reset, ...patch }).success).toBe(false);
});
it('permits unavailable values while rejecting raw JSON, actor data and extra metadata', () => {
  expect(ScopedSettingsHistoryRecord.safeParse(row({ values: { available: false } })).success).toBe(
    true,
  );
  for (const patch of [
    { values: { available: false, after: { privateMarker: 'omit' } } },
    { values: { available: true, operation: 'set', before: { privateMarker: 'omit' }, after: 20 } },
    { actorPersonId: 'private-person' },
    { scheduledActionId: 'private-action' },
    { scopeId: 'private-scope' },
    { reason: 'x'.repeat(501) },
    { version: 0 },
    { source: 'unknown' },
    { createdAt: 'invalid' },
  ])
    expect(ScopedSettingsHistoryRecord.safeParse(row(patch)).success).toBe(false);
});
it('binds response scope/key/count/unique IDs and keyset cursor to the returned rows', () => {
  expect(ScopedSettingsHistoryResponse.safeParse(response()).success).toBe(true);
  expect(
    ScopedSettingsHistoryResponse.safeParse(
      response({ meta: { count: 1, nextCursor: 'history-a' } }),
    ).success,
  ).toBe(true);
  for (const patch of [
    { key: 'capture.open' },
    { target: { scope: 'event', stationId: 'station-a' } },
    { target: { scope: 'station', stationId: 'station-a' }, key: 'longShiftMinutes' },
    { meta: { count: 2, nextCursor: null } },
    { data: [row(), row()], meta: { count: 2, nextCursor: null } },
    { meta: { count: 1, nextCursor: 'foreign-history' } },
    { data: [], meta: { count: 0, nextCursor: 'history-a' } },
    { actorPersonId: 'private-person' },
  ])
    expect(ScopedSettingsHistoryResponse.safeParse(response(patch)).success).toBe(false);
});
