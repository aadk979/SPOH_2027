import { expect, it } from 'vitest';
import {
  EventSettingHistoryQuery,
  EventSettingHistoryRecord,
  EventSettingHistoryResponse,
} from './index.js';
const record = {
  id: 'synthetic-history',
  eventId: 'synthetic-event',
  key: 'product.countsMode',
  version: 1,
  source: 'USER',
  createdAt: '2027-01-01T00:00:00Z',
  createdByYou: true,
  reason: null,
  values: {
    available: true,
    before: { mode: 'separate' },
    after: { mode: 'headline', source: { count: 'registrations' } },
  },
};
it('bounds history pages and allows only the two guarded product keys', () => {
  expect(EventSettingHistoryQuery.parse({ key: 'product.countsMode', limit: '2' })).toEqual({
    key: 'product.countsMode',
    limit: 2,
  });
  for (const input of [
    {},
    { key: 'capture.open' },
    { key: 'toString' },
    { key: record.key, limit: 201 },
    { key: record.key, scope: 'PLATFORM' },
  ])
    expect(EventSettingHistoryQuery.safeParse(input).success).toBe(false);
});
it('keeps valid count values strict and unavailable historical values explicit', () => {
  expect(EventSettingHistoryRecord.parse(record)).toEqual(record);
  expect(
    EventSettingHistoryRecord.safeParse({ ...record, values: { available: false } }).success,
  ).toBe(true);
  for (const values of [
    { available: true, before: null, after: { mode: 'sum' } },
    { available: false, after: 'private stored data' },
  ])
    expect(EventSettingHistoryRecord.safeParse({ ...record, values }).success).toBe(false);
});
it('accepts only mode metadata for visitor settings, with no personal fields', () => {
  const visitor = {
    ...record,
    key: 'product.visitorDataMode',
    values: { available: true, before: 'none', after: 'allowlist' },
  };
  expect(EventSettingHistoryRecord.safeParse(visitor).success).toBe(true);
  expect(
    EventSettingHistoryRecord.safeParse({
      ...visitor,
      values: { ...visitor.values, after: { email: 'private@invalid.test' } },
    }).success,
  ).toBe(false);
});
it('rejects private identities, unsupported sources and unbounded reasons', () => {
  for (const patch of [
    { actorPersonId: 'private-person' },
    { scheduledActionId: 'private-action' },
    { source: 'unknown' },
    { reason: 'x'.repeat(501) },
    { version: 0 },
  ])
    expect(EventSettingHistoryRecord.safeParse({ ...record, ...patch }).success).toBe(false);
});
it('rejects response event/key/count mismatches, duplicate rows and extra fields', () => {
  const response = {
    eventId: record.eventId,
    key: record.key,
    evaluatedAt: record.createdAt,
    data: [record],
    meta: { count: 1, nextCursor: null },
  };
  expect(EventSettingHistoryResponse.safeParse(response).success).toBe(true);
  for (const patch of [
    { eventId: 'other' },
    { key: 'product.visitorDataMode' },
    { meta: { count: 0, nextCursor: null } },
    { data: [record, record], meta: { count: 2, nextCursor: null } },
    { actor: 'private-person' },
  ])
    expect(EventSettingHistoryResponse.safeParse({ ...response, ...patch }).success).toBe(false);
});
