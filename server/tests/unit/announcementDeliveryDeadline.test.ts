import { expect, it } from 'vitest';
import { deliveryDeadlineMs } from '../../src/modules/announcement/domain/deliveryDeadline.js';

const createdAt = new Date('2027-01-07T03:30:00Z');
it.each([
  [null, 1800],
  [new Date(createdAt.getTime() + 600_000), 600],
  [new Date(createdAt.getTime() + 3600_000), 1800],
  [createdAt, 0],
  [new Date(createdAt.getTime() - 1000), -1],
])('caps delivery at its original lifetime and explicit expiry: %s', (expiresAt, seconds) => {
  expect(deliveryDeadlineMs({ createdAt, expiresAt }, 1800)).toBe(
    createdAt.getTime() + seconds * 1000,
  );
});
