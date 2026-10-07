import { expect, it } from 'vitest';
import { RevertEventSettingRequest, RevertEventSettingResponse } from './index.js';
const request = {
  key: 'product.countsMode',
  historyId: 'synthetic-history',
  expectedVersion: 2,
  reason: 'Restore the reviewed count rule',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
};
it('accepts a reviewed historical target and trims its required reason', () => {
  expect(RevertEventSettingRequest.parse({ ...request, reason: ` ${request.reason} ` })).toEqual(
    request,
  );
});
it('refuses generic writes, forged attribution and invalid reviewed targets', () => {
  for (const patch of [
    { key: 'capture.open' },
    { value: { mode: 'separate' } },
    { source: 'USER' },
    { personId: 'someone' },
    { historyId: '' },
    { expectedVersion: -1 },
    { reason: ' ' },
    { idempotencyKey: 'bad' },
  ])
    expect(RevertEventSettingRequest.safeParse({ ...request, ...patch }).success).toBe(false);
});
it('returns a strict new REVERT version and the current guarded settings', () => {
  const response = {
    history: {
      id: 'new-history',
      eventId: 'synthetic-event',
      key: request.key,
      version: 3,
      source: 'REVERT',
      createdAt: '2027-01-01T00:00:00Z',
      createdByYou: true,
      reason: request.reason,
      values: {
        available: true,
        before: { mode: 'headline', source: { count: 'registrations' } },
        after: { mode: 'separate' },
      },
    },
    current: {
      settings: {
        'product.countsMode': { mode: 'separate' },
        'product.visitorDataMode': 'none',
        lostPersonPurgeHours: 24,
      },
      versions: { 'product.countsMode': 3, 'product.visitorDataMode': 0, lostPersonPurgeHours: 0 },
    },
    reviewedVersion: 2,
    revertedFrom: { historyId: request.historyId, version: 1 },
  };
  expect(RevertEventSettingResponse.safeParse(response).success).toBe(true);
  for (const patch of [
    { actorPersonId: 'private' },
    { history: { ...response.history, source: 'USER' } },
    { revertedFrom: { historyId: request.historyId, version: 0 } },
  ])
    expect(RevertEventSettingResponse.safeParse({ ...response, ...patch }).success).toBe(false);
});
