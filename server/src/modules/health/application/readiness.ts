import { pingDatabase } from '../../../platform/db/client.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';

/**
 * How long a readiness answer is reused. `/readyz` is public through nginx, so
 * without this anyone could make the API spend a pool connection per request
 * (F04-008). Five seconds is well inside any load balancer's check interval,
 * so an outage is still reported on the next probe that matters. Behind the
 * ALB (P08.4) only the load balancer reaches it at all.
 */
export const READY_TTL_MS = 5_000;

let last: { at: number; error: unknown } | null = null;
let inflight: Promise<void> | null = null;

/**
 * Ready means the database answers. Throws when it does not. Concurrent probes
 * share one check, and a result is reused for READY_TTL_MS, so a burst of
 * probes costs at most one query.
 */
export async function checkReadiness(clock: Clock = systemClock): Promise<void> {
  if (last && clock.now().getTime() - last.at < READY_TTL_MS) {
    if (last.error !== null) throw last.error;
    return;
  }
  inflight ??= pingDatabase()
    .then(
      () => {
        last = { at: clock.now().getTime(), error: null };
      },
      (error: unknown) => {
        last = { at: clock.now().getTime(), error };
        throw error;
      },
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
