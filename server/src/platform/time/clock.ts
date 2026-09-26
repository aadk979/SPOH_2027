/**
 * The source of "now" (engineering-standards §7).
 *
 * Domain and application code take a `Clock` instead of calling `new Date()`,
 * so a use case can be tested at 23:59 on the last event day without faking
 * the process clock. P06 introduces it; each use case adopts it as it moves to
 * `application/`.
 */
export interface Clock {
  now(): Date;
}

/** The process clock, for production wiring. */
export const systemClock: Clock = {
  now: () => new Date(),
};

/** A clock stopped at one instant, for tests. */
export function fixedClock(instant: Date): Clock {
  return { now: () => new Date(instant.getTime()) };
}
