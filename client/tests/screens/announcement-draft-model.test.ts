import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/lib/apiErrors';
import { draftContentRequest, initialDraftValues } from '@/features/announcements/model/draftForm';
import { createRetryIntent } from '@/features/announcements/model/retryIntent';
import {
  announcementFormError,
  publicationInstant,
  publicationWallTime,
} from '@/features/announcements/model/scheduleForm';
import { PRIVATE_DRAFT } from '../helpers/announcement';

describe('private publication on the event clock', () => {
  it.each([
    ['2027-01-07T09:30', 'Asia/Singapore', '2027-01-07T01:30:00.000Z'],
    ['2027-01-07T09:30', 'America/New_York', '2027-01-07T14:30:00.000Z'],
    ['2027-03-28T01:30', 'Europe/London', '2027-03-28T01:00:00.000Z'],
    ['2027-10-31T01:30', 'Europe/London', '2027-10-31T00:30:00.000Z'],
  ])('interprets %s in %s independently of the device clock', (wall, timezone, instant) => {
    expect(publicationInstant(wall, timezone)).toBe(instant);
  });
  it.each([
    '',
    '2027-02-30T09:30',
    '2027-01-07T24:00',
    '2027-01-07T09:30Z',
    '2027-01-07T09:30Textra',
  ])('refuses malformed input %s', (wall) => {
    expect(() => publicationInstant(wall, 'Asia/Singapore')).toThrow();
  });
  it('displays a saved instant on the event clock', () => {
    expect(publicationWallTime('2027-01-07T01:30:45.123Z', 'Asia/Singapore')).toBe(
      '2027-01-07T09:30',
    );
  });
  it('preserves exact expiry seconds and hidden role/day restrictions on a body edit', () => {
    const draft = {
      ...PRIVATE_DRAFT,
      target: { stationId: 'station-a', role: 'ADMIN' as const, eventDayId: 'day-a' },
      expiresAt: '2027-01-07T01:30:45.123Z',
    };
    const values = {
      ...initialDraftValues(draft, 'Asia/Singapore'),
      body: '  Updated private text  ',
    };
    expect(
      draftContentRequest({ values, draft, timezone: 'Asia/Singapore', ownStationId: null }),
    ).toEqual({
      body: 'Updated private text',
      priority: 'INFO',
      requiresAck: false,
      target: draft.target,
      expiresAt: draft.expiresAt,
    });
  });
  it('can clear expiry without losing the saved audience restrictions', () => {
    const values = { ...initialDraftValues(PRIVATE_DRAFT, 'Asia/Singapore'), expiresWallTime: '' };
    expect(
      draftContentRequest({
        values,
        draft: PRIVATE_DRAFT,
        timezone: 'Asia/Singapore',
        ownStationId: null,
      }),
    ).toEqual({
      body: PRIVATE_DRAFT.body,
      priority: 'INFO',
      requiresAck: false,
      target: { role: 'ADMIN' },
    });
  });
  it('retains one retry key for unchanged intent and replaces it for a new intent', () => {
    const intent = createRetryIntent();
    const first = intent.keyFor({ body: 'Private fixture' });
    expect(intent.keyFor({ body: 'Private fixture' })).toBe(first);
    const changed = intent.keyFor({ body: 'Changed fixture' });
    expect(changed).not.toBe(first);
    intent.clear();
    expect(intent.keyFor({ body: 'Changed fixture' })).not.toBe(changed);
  });
  it('shows a safe conflict and withholds raw server failures', () => {
    expect(
      announcementFormError(
        new ApiError(409, {
          code: 'CONFLICT',
          message: 'Reload the saved version.',
          requestId: 'fixture',
        }),
      ),
    ).toBe('Reload the saved version.');
    expect(
      announcementFormError(
        new ApiError(500, {
          code: 'INTERNAL_ERROR',
          message: 'Private SQL fixture',
          requestId: 'fixture',
        }),
      ),
    ).not.toContain('SQL');
  });
});
