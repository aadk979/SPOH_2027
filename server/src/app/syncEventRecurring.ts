import { allEventScopes } from '../platform/event/events.js';
import { ensureRecurring } from '../platform/scheduler/ensureRecurring.js';
import type { HandlerRegistry } from '../platform/scheduler/registry.js';
import { systemClock, type Clock } from '../platform/time/index.js';

/** Discover post-startup events on the existing worker tick, without a separate timer. */
export function createEventRecurringSync(input: {
  registry: HandlerRegistry;
  actions: readonly { type: string; intervalSeconds: number }[];
  clock?: Clock;
}) {
  const clock = input.clock ?? systemClock;
  let nextCheck = Number.NEGATIVE_INFINITY;
  return async () => {
    const now = clock.now();
    if (now.getTime() < nextCheck) return;
    for (const scope of await allEventScopes()) {
      for (const action of input.actions) {
        await ensureRecurring({ ...action, ...scope, registry: input.registry, clock });
      }
    }
    // Set only after success: a failed discovery is retried by the next normal worker poll.
    nextCheck = now.getTime() + 60_000;
  };
}
