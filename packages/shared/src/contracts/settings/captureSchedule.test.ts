import { describe, expect, it } from 'vitest';
import { CreateCaptureScheduleRequest, CaptureScheduleResponse } from './captureSchedule.js';
import { GENERATED_SETTING_DEFAULTS } from '../../generated/settings/index.js';
import { scopedOperationalKeys } from './scopedRead.js';

const request = {
  target: { scope: 'event' },
  key: 'capture.open',
  value: false,
  expectedVersion: 0,
  runAt: '2027-01-07T12:00:00+08:00',
  reason: '  Reviewed capture pause  ',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};
const response = () => {
  const { idempotencyKey: _key, ...intent } = CreateCaptureScheduleRequest.parse(request);
  return {
    schedule: {
      id: 'synthetic-action',
      eventId: 'synthetic-event',
      kind: 'SETTING',
      ...intent,
      scheduledFor: '2027-01-07T04:00:00.000Z',
      runAt: '2027-01-07T04:00:00.000Z',
      status: 'PENDING',
      version: 1,
      attempts: 0,
      maxAttempts: 5,
      recurring: false,
      createdByYou: true,
      createdAt: '2027-01-07T03:00:00Z',
      completedAt: null,
      lastError: null,
    },
    current: {
      eventId: 'synthetic-event',
      target: { scope: 'event' },
      eventStatus: 'READY',
      evaluatedAt: '2027-01-07T03:00:00Z',
      data: scopedOperationalKeys('event').map((key) => ({
        key,
        value: GENERATED_SETTING_DEFAULTS[key],
        source: { scope: 'default', version: 0 },
        storedVersion: 0,
        invalidScopes: [],
      })),
    },
  };
};
describe('reviewed capture schedule contract', () => {
  it('normalises the reason and instant while retaining the selected version', () => {
    expect(CreateCaptureScheduleRequest.parse(request)).toMatchObject({
      expectedVersion: 0,
      reason: 'Reviewed capture pause',
      runAt: '2027-01-07T04:00:00.000Z',
    });
    expect(
      CreateCaptureScheduleRequest.parse({
        ...request,
        target: { scope: 'station', stationId: 'owned' },
      }).target,
    ).toEqual({ scope: 'station', stationId: 'owned' });
  });
  it.each([
    { key: 'product.visitorDataMode' },
    { key: 'lostPersonPurgeHours' },
    { target: { scope: 'platform' } },
    { target: { scope: 'event', stationId: 'foreign' } },
    { value: 'false' },
    { value: null },
    { expectedVersion: -1 },
    { expectedVersion: 0.5 },
    { reason: ' x ' },
    { reason: 'x'.repeat(501) },
    { runAt: '2027-01-07T12:00' },
    { idempotencyKey: 'invalid' },
    { recurrenceSeconds: 60 },
    { maxAttempts: 10 },
    { actorId: 'other' },
    { source: 'SYSTEM' },
    { eventId: 'other' },
    { operation: 'reset' },
  ])('refuses unreviewed or unsupported intent %j', (patch) => {
    expect(CreateCaptureScheduleRequest.safeParse({ ...request, ...patch }).success).toBe(false);
  });
  it('accepts owned status with a strict current catalogue, excluding the request UUID', () => {
    const data = response();
    expect(CaptureScheduleResponse.safeParse(data).success).toBe(true);
    expect(
      CaptureScheduleResponse.safeParse({
        ...data,
        schedule: { ...data.schedule, idempotencyKey: request.idempotencyKey },
      }).success,
    ).toBe(false);
  });
  it.each([
    ['silentStationMinutes', 12, { scope: 'station', stationId: 'owned' }],
    ['captureUndoWindowSeconds', 6, { scope: 'event' }],
    ['vocabulary.missionCard', 'Journey Card', { scope: 'event' }],
    ['incident.pushSeverities', ['CRITICAL'], { scope: 'event' }],
  ])('validates generated operational %s schedules', (key, value, target) => {
    expect(CreateCaptureScheduleRequest.safeParse({ ...request, key, value, target }).success).toBe(
      true,
    );
  });
  it.each([
    { key: 'staleDeviceMinutes', value: 12, target: { scope: 'station', stationId: 'owned' } },
    { key: 'silentStationMinutes', value: 0 },
    { key: 'incident.pushSeverities', value: ['INVALID'] },
    { key: 'dashboardPollSeconds', value: 12 },
    { key: 'product.countsMode', value: { mode: 'separate' } },
  ])('rejects a wrong generated scope or value %j', (patch) => {
    expect(CreateCaptureScheduleRequest.safeParse({ ...request, ...patch }).success).toBe(false);
  });
  it('refuses a response whose current event or target differs from the action', () => {
    const data = response();
    expect(
      CaptureScheduleResponse.safeParse({
        ...data,
        current: { ...data.current, eventId: 'foreign' },
      }).success,
    ).toBe(false);
    expect(
      CaptureScheduleResponse.safeParse({
        ...data,
        schedule: { ...data.schedule, target: { scope: 'station', stationId: 'foreign' } },
      }).success,
    ).toBe(false);
  });
  it('refuses private identities, unbounded errors and unsupported recurrence in status', () => {
    const data = response();
    for (const patch of [
      { createdByPersonId: 'private' },
      { payload: {} },
      { lastError: 'Raw internal error' },
      { key: 'product.visitorDataMode' },
      { recurring: true },
      { value: 'false' },
      { version: 0 },
    ])
      expect(
        CaptureScheduleResponse.safeParse({ ...data, schedule: { ...data.schedule, ...patch } })
          .success,
      ).toBe(false);
  });
});
