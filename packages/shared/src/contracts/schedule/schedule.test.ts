import { expect, it } from 'vitest';
import { AnnouncementScheduleError } from '../announcement/index.js';
import {
  ScheduleError,
  ScheduleTimelineQuery,
  ScheduleTimelineRecord,
  ScheduleTimelineResponse,
} from './index.js';

const instant = '2027-01-07T03:30:00.000Z';
const record = {
  id: 'synthetic-action',
  eventId: 'synthetic-event',
  kind: 'SETTING',
  scheduledFor: instant,
  runAt: instant,
  status: 'PENDING',
  version: 1,
  attempts: 0,
  maxAttempts: 5,
  recurring: false,
  createdByYou: true,
  createdAt: instant,
  completedAt: null,
  lastError: null,
};

it('shares the existing bounded announcement failure catalogue without changing its contract', () => {
  expect(AnnouncementScheduleError).toBe(ScheduleError);
  expect(ScheduleError.safeParse('raw provider response').success).toBe(false);
});

it('defaults/coerces bounded pagination and rejects arbitrary filters or event identity', () => {
  expect(ScheduleTimelineQuery.parse({})).toEqual({ limit: 50 });
  expect(ScheduleTimelineQuery.parse({ limit: '2', status: 'RUNNING' })).toEqual({
    limit: 2,
    status: 'RUNNING',
  });
  for (const query of [
    { limit: 0 },
    { limit: 201 },
    { limit: 1.5 },
    { status: 'broken' },
    { eventId: 'other' },
  ]) {
    expect(ScheduleTimelineQuery.safeParse(query).success).toBe(false);
  }
});

it('accepts only strict safe metadata and bound failure codes', () => {
  expect(ScheduleTimelineRecord.parse(record)).toEqual(record);
  for (const patch of [
    { payload: {} },
    { audience: [] },
    { lockedBy: 'lease' },
    { createdByPersonId: 'person' },
    { type: 'raw handler' },
    { lastError: 'private SQL' },
    { attempts: -1 },
    { version: 0 },
  ]) {
    expect(ScheduleTimelineRecord.safeParse({ ...record, ...patch }).success).toBe(false);
  }
});

it('rejects mismatched events, counts, duplicate IDs and extra response fields', () => {
  const response = {
    eventId: record.eventId,
    evaluatedAt: instant,
    data: [record],
    meta: { count: 1, nextCursor: null },
  };
  expect(ScheduleTimelineResponse.safeParse(response).success).toBe(true);
  for (const patch of [
    { eventId: 'other' },
    { meta: { count: 0, nextCursor: null } },
    { data: [record, record], meta: { count: 2, nextCursor: null } },
    { payload: {} },
  ]) {
    expect(ScheduleTimelineResponse.safeParse({ ...response, ...patch }).success).toBe(false);
  }
});
