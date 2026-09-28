import { describe, expect, it } from 'vitest';
import {
  rolesAtOrAbove,
  subscriptionGone,
  TTL_SECONDS,
} from '../../src/modules/notification/domain/delivery.js';

/** Push delivery rules (P06.8), without a database or a push service. */

describe('push delivery rules', () => {
  it('addresses a minimum role and every role above it', () => {
    const roles = rolesAtOrAbove('DEPUTY_COORDINATOR');
    expect(roles).toContain('DEPUTY_COORDINATOR');
    expect(roles).toContain('CHIEF_COORDINATOR');
    expect(roles).not.toContain('IC');
    expect(roles).not.toContain('VOLUNTEER');
  });

  it('prunes a subscription only when the push service says it is gone', () => {
    expect(subscriptionGone(404)).toBe(true);
    expect(subscriptionGone(410)).toBe(true);
    expect(subscriptionGone(500)).toBe(false);
    expect(subscriptionGone(undefined)).toBe(false);
  });

  it('lets a lost-person alert expire sooner than an announcement', () => {
    expect(TTL_SECONDS['lostPerson.raised']).toBeLessThan(TTL_SECONDS['announcement.urgent']);
  });
});
