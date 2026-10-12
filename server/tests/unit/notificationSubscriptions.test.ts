import { beforeEach, expect, it, vi } from 'vitest';
import { subscribeDevice } from '../../src/modules/notification/application/subscriptions.js';
import { MAX_DEVICES_PER_PERSON } from '../../src/modules/notification/domain/delivery.js';
import { UnauthenticatedError } from '../../src/platform/errors/index.js';
import { fixedClock } from '../../src/platform/time/index.js';

const repo = vi.hoisted(() => ({
  upsertSubscription: vi.fn(),
  pruneDevicesBeyond: vi.fn(),
  deleteOwnSubscription: vi.fn(),
}));
vi.mock('../../src/modules/notification/data/repo.js', () => repo);

const input = {
  volunteerId: 'subscription-owner',
  endpoint: 'https://push.example.test/device',
  p256dh: 'synthetic-public-key',
  auth: 'synthetic-auth-key',
  userAgent: null,
};
const now = new Date('2027-01-07T03:00:00.000Z');

beforeEach(() => vi.resetAllMocks());

it('translates a locked inactive-owner result into authentication refusal without pruning devices', async () => {
  repo.upsertSubscription.mockResolvedValue(null);
  await expect(subscribeDevice(input, fixedClock(now))).rejects.toBeInstanceOf(UnauthenticatedError);
  expect(repo.upsertSubscription).toHaveBeenCalledExactlyOnceWith(input, now);
  expect(repo.pruneDevicesBeyond).not.toHaveBeenCalled();
});

it('returns the stored subscription unchanged and prunes only its authenticated owner after success', async () => {
  const subscription = { id: 'confirmed-subscription' };
  repo.upsertSubscription.mockResolvedValue(subscription);
  repo.pruneDevicesBeyond.mockResolvedValue(0);
  await expect(subscribeDevice(input, fixedClock(now))).resolves.toBe(subscription);
  expect(repo.upsertSubscription).toHaveBeenCalledExactlyOnceWith(input, now);
  expect(repo.pruneDevicesBeyond).toHaveBeenCalledExactlyOnceWith(input.volunteerId, MAX_DEVICES_PER_PERSON);
});
