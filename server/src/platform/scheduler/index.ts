import { logger } from '../logger/index.js';

/**
 * In-process scheduled jobs.
 *
 * Deliberately a `setInterval` rather than EventBridge or a queue: there are
 * four jobs, all idempotent, all cheap, and none is worth a second piece of
 * infrastructure to operate at 10am on 7 January (BUILD_PLAN §1.1).
 *
 * Every job is safe to run concurrently on multiple instances — the purge
 * claims each alert with a conditional write, the prunes are bounded deletes
 * and the settings refresh only reads — so no leader election is needed.
 *
 * Modules and platform services declare their jobs; the composition root
 * (app/jobs.ts) lists them and starts them here. P10 replaces the interval
 * with the job table.
 */

/** A job a module registers: a name for the logs, how often, and what to run. */
export interface ScheduledJob {
  readonly name: string;
  readonly intervalMs: number;
  run(): Promise<unknown>;
}

export interface StoppableJobs {
  stop(): void;
}

export function startJobs(jobs: readonly ScheduledJob[]): StoppableJobs {
  const timers = jobs.map((job) => schedule(job.name, job.intervalMs, job.run));
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
function schedule(name: string, intervalMs: number, run: () => Promise<unknown>): NodeJS.Timeout {
  const timer = setInterval(() => {
    void run().catch((error: unknown) => {
      logger.error({ err: error, job: name }, 'scheduled job failed');
    });
  }, intervalMs);

  // Do not hold the event loop open on this timer alone.
  timer.unref();

  return timer;
}
