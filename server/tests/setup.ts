import { afterAll, beforeAll, vi } from 'vitest';
import { disconnectPrisma, pingDatabase } from '../src/platform/db/client.js';

/**
 * Integration test setup.
 *
 * Tests run against a real Postgres — the same engine as production, because
 * the count aggregations use `date_trunc` and epoch bucketing that an in-memory
 * substitute would not reproduce faithfully.
 *
 * The clock is frozen. Station scoping asks "is this volunteer rostered here,
 * in a shift block running right now", so a suite that used the wall clock
 * would pass at 11am and fail at 8pm. The frozen instant sits inside the
 * MORNING block on a real event day, and every capture timestamp is
 * server-stamped (BUILD_PLAN §3.3) so the database agrees with it.
 *
 * Only `Date` is faked: faking timers as well would stall the pg driver's
 * internal timeouts.
 */

/** 2027-01-07 11:30 Singapore — Open House Day 1, mid-morning block. */
export const FROZEN_NOW = new Date('2027-01-07T03:30:00.000Z');

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
  await pingDatabase();
});

afterAll(async () => {
  vi.useRealTimers();
  await disconnectPrisma();
});
