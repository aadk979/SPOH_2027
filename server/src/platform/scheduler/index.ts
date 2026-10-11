import { logger } from '../logger/index.js';

/**
 * Local ticks (ADR-004 §4): per-instance, in memory and not audited. Only cache
 * maintenance and per-instance metric summaries run here (`app/jobs.ts`); every
 * business job is a durable action in app/startScheduledJobs.ts.
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
