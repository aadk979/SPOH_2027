import { describe, expect, it } from 'vitest';
import { CreateAnnouncementDraftRequest, UpdateAnnouncementDraftRequest } from './index.js';

describe('private announcement draft inputs', () => {
  const input = { body: ' Draft message ', idempotencyKey: '11111111-1111-4111-8111-111111111111' };
  it('requires a retry UUID and retains content defaults', () => {
    expect(CreateAnnouncementDraftRequest.parse(input)).toEqual({
      body: 'Draft message',
      idempotencyKey: input.idempotencyKey,
      priority: 'INFO',
      target: {},
      requiresAck: false,
    });
    expect(CreateAnnouncementDraftRequest.safeParse({ body: 'Draft message' }).success).toBe(false);
  });
  it.each(['authorId', 'authorMembershipId', 'eventId', 'publishedAt', 'runAt'])(
    'refuses injected %s',
    (key) => {
      expect(
        CreateAnnouncementDraftRequest.safeParse({ ...input, [key]: 'untrusted' }).success,
      ).toBe(false);
    },
  );
  it.each([0, -1, 1.5, '1', null])('requires a positive integer version: %s', (version) => {
    expect(
      UpdateAnnouncementDraftRequest.safeParse({ body: input.body, expectedVersion: version })
        .success,
    ).toBe(false);
  });
});
