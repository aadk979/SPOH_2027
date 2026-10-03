import { expect, it } from 'vitest';
import { PublishAnnouncementPayload } from './index.js';

const payload = { draftId: 'saved-draft', expectedVersion: 1 };
it('requires an explicit saved draft version for timed publication', () => {
  expect(PublishAnnouncementPayload.parse(payload)).toEqual(payload);
  expect(PublishAnnouncementPayload.safeParse({ draftId: payload.draftId }).success).toBe(false);
});
it.each([0, -1, 1.5, '1', null])('refuses an invalid expected version: %s', (expectedVersion) => {
  expect(PublishAnnouncementPayload.safeParse({ ...payload, expectedVersion }).success).toBe(false);
});
it.each(['announcementId', 'body', 'authorId', 'eventId', 'runAt', 'idempotencyKey'])(
  'refuses injected %s in scheduled content',
  (key) => {
    expect(PublishAnnouncementPayload.safeParse({ ...payload, [key]: 'untrusted' }).success).toBe(
      false,
    );
  },
);
