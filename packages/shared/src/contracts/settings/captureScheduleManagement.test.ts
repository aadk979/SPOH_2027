import { expect, it } from 'vitest';
import {
  CancelCaptureScheduleRequest,
  CaptureScheduleListQuery,
  CaptureScheduleListResponse,
  UpdateCaptureScheduleRequest,
} from './captureScheduleManagement.js';

const update = {
  expectedScheduleVersion: 1,
  expectedVersion: 0,
  value: false,
  runAt: '2027-01-07T12:00:00+08:00',
  reason: '  Reviewed schedule edit  ',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};
const listResponse = () => ({
  eventId: 'owned-event',
  target: { scope: 'event' },
  key: 'capture.open',
  evaluatedAt: '2027-01-07T03:00:00Z',
  data: [
    {
      id: 'owned-schedule',
      eventId: 'owned-event',
      target: { scope: 'event' },
      key: 'capture.open',
      value: false,
      expectedVersion: 0,
      reason: 'Reviewed pause',
      kind: 'SETTING',
      recurring: false,
      runAt: '2027-01-07T04:00:00Z',
      scheduledFor: '2027-01-07T04:00:00Z',
      status: 'PENDING',
      version: 1,
      attempts: 0,
      maxAttempts: 5,
      createdByYou: true,
      createdAt: '2027-01-07T03:00:00Z',
      completedAt: null,
      lastError: null,
    },
  ],
  meta: { count: 1, nextCursor: null },
});
it('accepts a strict operational list and an empty raw page with a progressing cursor', () => {
  expect(CaptureScheduleListResponse.safeParse(listResponse()).success).toBe(true);
  expect(
    CaptureScheduleListResponse.safeParse({
      ...listResponse(),
      data: [],
      meta: { count: 0, nextCursor: 'raw-page-cursor' },
    }).success,
  ).toBe(true);
});
it('refuses foreign/duplicate rows, wrong counts and private metadata in a capture list', () => {
  const response = listResponse();
  const row = response.data[0]!;
  for (const patch of [
    { eventId: 'foreign' },
    { target: { scope: 'station', stationId: 'foreign' } },
    { key: 'product.visitorDataMode' },
    { createdByPersonId: 'private' },
    { payload: {} },
    { lastError: 'raw-error' },
  ])
    expect(
      CaptureScheduleListResponse.safeParse({ ...response, data: [{ ...row, ...patch }] }).success,
    ).toBe(false);
  expect(
    CaptureScheduleListResponse.safeParse({
      ...response,
      data: [row, row],
      meta: { count: 2, nextCursor: null },
    }).success,
  ).toBe(false);
  expect(
    CaptureScheduleListResponse.safeParse({ ...response, meta: { count: 0, nextCursor: null } })
      .success,
  ).toBe(false);
});
it('requires independent schedule and selected setting versions and normalises intent', () => {
  expect(UpdateCaptureScheduleRequest.parse(update)).toMatchObject({
    expectedScheduleVersion: 1,
    expectedVersion: 0,
    reason: 'Reviewed schedule edit',
    runAt: '2027-01-07T04:00:00.000Z',
  });
});
it.each([
  { expectedScheduleVersion: 0 },
  { expectedScheduleVersion: 1.5 },
  { expectedVersion: -1 },
  { value: null },
  { runAt: '2027-01-07T12:00' },
  { reason: ' x ' },
  { reason: 'x'.repeat(501) },
  { idempotencyKey: 'invalid' },
  { target: { scope: 'event' } },
  { key: 'capture.open' },
  { createdByPersonId: 'other' },
  { recurrence: 60 },
])('rejects unsupported schedule edits %j', (patch) => {
  expect(UpdateCaptureScheduleRequest.safeParse({ ...update, ...patch }).success).toBe(false);
});
it('cancellation requires reviewed schedule version, reason and UUID only', () => {
  const cancel = {
    expectedScheduleVersion: 1,
    reason: 'Cancel review',
    idempotencyKey: update.idempotencyKey,
  };
  expect(CancelCaptureScheduleRequest.safeParse(cancel).success).toBe(true);
  for (const patch of [
    { expectedScheduleVersion: 0 },
    { reason: 'x' },
    { value: false },
    { runAt: update.runAt },
    { idempotencyKey: 'invalid' },
  ])
    expect(CancelCaptureScheduleRequest.safeParse({ ...cancel, ...patch }).success).toBe(false);
});
it('lists one exact capture target with bounded status/keyset pagination', () => {
  expect(CaptureScheduleListQuery.parse({})).toMatchObject({
    scope: 'event',
    key: 'capture.open',
    limit: 50,
  });
  expect(
    CaptureScheduleListQuery.safeParse({
      scope: 'station',
      stationId: 'owned',
      limit: '2',
      status: 'PENDING',
      cursor: 'owned-action',
    }).success,
  ).toBe(true);
});
it.each([
  { scope: 'platform' },
  { scope: 'station' },
  { scope: 'event', stationId: 'foreign' },
  { key: 'product.visitorDataMode' },
  { limit: 201 },
  { limit: 0 },
  { status: 'UNKNOWN' },
  { cursor: 'x'.repeat(65) },
  { eventId: 'other' },
  { personId: 'other' },
])('rejects unsupported schedule lists %j', (query) => {
  expect(CaptureScheduleListQuery.safeParse(query).success).toBe(false);
});
