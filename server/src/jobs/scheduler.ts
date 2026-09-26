import { logger } from '../platform/logger/index.js';
import { loadSettings } from '../platform/settings/index.js';
import { pruneIdempotencyRecords } from '../platform/idempotency/index.js';
import { purgeResolvedAlerts } from '../modules/lostPerson/service.js';
import { pruneRefreshSessions } from '../modules/auth/service.js';

/**
 * In-process scheduled jobs.
 *
 * Deliberately a `setInterval` rather than EventBridge or a queue: there are
 * two jobs, both idempotent, both cheap, and neither is worth a second piece of
 * infrastructure to operate at 10am on 7 January (BUILD_PLAN §1.1).
 *
 * Both jobs are safe to run concurrently on multiple instances — the purge is
 * transactional per alert and the prune is a bounded delete — so no leader
 * election is needed.
 */

const PURGE_INTERVAL_MS = 15 * 60 * 1000;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * How long a settings change takes to reach an instance that did not make it.
 *
 * A write refreshes its own instance immediately; this is what brings the
 * others into line. One minute is the right trade for values that change a
 * handful of times across the event's life — long enough to cost nothing, short
 * enough that an admin who moves a shift boundary sees it take effect while
 * they are still looking at the screen.
 */
const SETTINGS_REFRESH_MS = 60 * 1000;

export interface StoppableJobs {
  stop(): void;
}

export function startScheduledJobs(): StoppableJobs {
  const timers: NodeJS.Timeout[] = [];

  timers.push(
    schedule('lost-person purge', PURGE_INTERVAL_MS, async () => {
      await purgeResolvedAlerts();
    }),
  );

  timers.push(
    schedule('idempotency prune', PRUNE_INTERVAL_MS, async () => {
      const removed = await pruneIdempotencyRecords();
      if (removed > 0) logger.info({ removed }, 'pruned expired idempotency records');
    }),
  );

  // Expired and long-revoked sessions. This is the table that grows fastest,
  // because every silent refresh writes a row.
  timers.push(
    schedule('refresh session prune', PRUNE_INTERVAL_MS, async () => {
      await pruneRefreshSessions();
    }),
  );

  // Converge on settings changed by another instance.
  timers.push(
    schedule('settings refresh', SETTINGS_REFRESH_MS, async () => {
      await loadSettings();
    }),
  );

  return {
    stop() {
      for (const timer of timers) clearInterval(timer);
    },
  };
}

/**
 * A failing job must never take the process down — the API serving booth taps
 * matters more than a purge that can run again in fifteen minutes.
 */
function schedule(name: string, intervalMs: number, run: () => Promise<void>): NodeJS.Timeout {
  const timer = setInterval(() => {
    void run().catch((error: unknown) => {
      logger.error({ err: error, job: name }, 'scheduled job failed');
    });
  }, intervalMs);

  // Do not hold the event loop open on this timer alone.
  timer.unref();

  return timer;
}
