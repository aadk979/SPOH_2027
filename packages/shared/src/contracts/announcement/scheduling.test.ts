import { expect, it } from 'vitest';
import {
  AnnouncementPublicationScheduleRecord,
  ScheduleAnnouncementDraftRequest,
  UpdateAnnouncementPublicationScheduleRequest,
  CancelAnnouncementPublicationScheduleRequest,
} from './index.js';

const input = {
  expectedVersion: 1,
  runAt: '2027-01-07T03:31:00.000Z',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
};
it('requires explicit version, time and retry UUID', () => {
  expect(ScheduleAnnouncementDraftRequest.parse(input)).toEqual(input);
  for (const key of Object.keys(input)) {
    const incomplete = { ...input } as Record<string, unknown>;
    delete incomplete[key];
    expect(ScheduleAnnouncementDraftRequest.safeParse(incomplete).success).toBe(false);
  }
});
it('requires separate current action and reviewed draft versions for editing', () => {
  const update = {
    expectedVersion: 2,
    expectedDraftVersion: 3,
    runAt: input.runAt,
    reason: 'Correct timing',
  };
  expect(UpdateAnnouncementPublicationScheduleRequest.parse(update)).toEqual(update);
  for (const key of ['expectedVersion', 'expectedDraftVersion', 'runAt']) {
    const incomplete = { ...update } as Record<string, unknown>;
    delete incomplete[key];
    expect(UpdateAnnouncementPublicationScheduleRequest.safeParse(incomplete).success).toBe(false);
  }
});
it.each([
  { expectedVersion: 0 },
  { expectedDraftVersion: 0 },
  { body: 'Unreviewed' },
  { recurrence: 60 },
  { reason: 'x' },
])('refuses invalid edit input %j', (patch) => {
  expect(
    UpdateAnnouncementPublicationScheduleRequest.safeParse({
      expectedVersion: 1,
      expectedDraftVersion: 1,
      runAt: input.runAt,
      ...patch,
    }).success,
  ).toBe(false);
});
it('requires current action version and a bounded optional cancellation reason', () => {
  expect(CancelAnnouncementPublicationScheduleRequest.parse({ expectedVersion: 1 })).toEqual({
    expectedVersion: 1,
  });
  for (const invalid of [
    {},
    { expectedVersion: 0 },
    { expectedVersion: 1, status: 'SUCCEEDED' },
    { expectedVersion: 1, reason: 'x'.repeat(501) },
  ])
    expect(CancelAnnouncementPublicationScheduleRequest.safeParse(invalid).success).toBe(false);
});
it.each(['type', 'body', 'eventId', 'createdByPersonId', 'recurrence', 'maxAttempts', 'expiresAt'])(
  'refuses injected %s',
  (key) => {
    expect(
      ScheduleAnnouncementDraftRequest.safeParse({ ...input, [key]: 'untrusted' }).success,
    ).toBe(false);
  },
);
it.each([0, -1, 1.5, '1', null])('refuses unsafe draft version: %s', (expectedVersion) => {
  expect(ScheduleAnnouncementDraftRequest.safeParse({ ...input, expectedVersion }).success).toBe(
    false,
  );
});
it('rejects raw exceptions and internal payload/lease fields in public status', () => {
  const record = {
    id: 'schedule',
    eventId: 'event',
    draftId: 'draft',
    draftVersion: 1,
    runAt: input.runAt,
    scheduledFor: input.runAt,
    status: 'PENDING',
    version: 1,
    createdAt: input.runAt,
    completedAt: null,
    lastError: null,
  };
  expect(AnnouncementPublicationScheduleRecord.parse(record)).toEqual(record);
  expect(
    AnnouncementPublicationScheduleRecord.safeParse({
      ...record,
      lastError: 'private provider exception',
    }).success,
  ).toBe(false);
  expect(
    AnnouncementPublicationScheduleRecord.safeParse({
      ...record,
      payload: {},
      lockedBy: 'private worker',
    }).success,
  ).toBe(false);
});
