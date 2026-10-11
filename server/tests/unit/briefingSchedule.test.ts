import { describe, expect, it } from 'vitest';
import { CreateBriefingSlotRequest } from '@spoh/shared';
import { assertBriefingSchedule } from '../../src/modules/shift/domain/briefingSchedule.js';

const request = CreateBriefingSlotRequest.parse({
  idempotencyKey: crypto.randomUUID(),
  eventDayId: 'day',
  startsAt: '2027-01-08T01:00:00.000Z',
  briefierId: 'person',
  waveSize: 20,
});
const context = {
  day: { date: new Date('2027-01-08T00:00:00.000Z') },
  event: { timezone: 'Asia/Singapore', status: 'DRAFT' as const },
  member: { status: 'ACTIVE' },
  startsAt: new Date(request.startsAt),
};

describe('briefing schedule rules', () => {
  it('accepts an event-local date even when UTC names yesterday', () => {
    expect(() =>
      assertBriefingSchedule(request, {
        ...context,
        startsAt: new Date('2027-01-07T23:00:00.000Z'),
      }),
    ).not.toThrow();
  });
  it('refuses another day and archived events', () => {
    expect(() =>
      assertBriefingSchedule(request, {
        ...context,
        startsAt: new Date('2027-01-09T01:00:00.000Z'),
      }),
    ).toThrow(/selected event day/);
    expect(() =>
      assertBriefingSchedule(request, {
        ...context,
        event: { ...context.event, status: 'ARCHIVED' },
      }),
    ).toThrow(/read only/);
  });
  it('requires a day in this event and an active briefer', () => {
    expect(() => assertBriefingSchedule(request, { ...context, day: null })).toThrow(/Event day/);
    expect(() =>
      assertBriefingSchedule(request, { ...context, member: { status: 'DEACTIVATED' } }),
    ).toThrow(/Active briefer/);
    expect(() => assertBriefingSchedule(request, { ...context, member: null })).toThrow(
      /Active briefer/,
    );
    expect(() =>
      assertBriefingSchedule({ ...request, briefierId: null }, { ...context, member: null }),
    ).not.toThrow();
  });
  it('requires a receipt and rejects empty and oversized waves', () => {
    expect(
      CreateBriefingSlotRequest.safeParse({ ...request, idempotencyKey: undefined }).success,
    ).toBe(false);
    for (const waveSize of [0, 1001, 1.5])
      expect(CreateBriefingSlotRequest.safeParse({ ...request, waveSize }).success).toBe(false);
  });
});
