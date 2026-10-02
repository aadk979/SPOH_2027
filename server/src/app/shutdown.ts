import type { Server } from 'node:http';
import { disconnectPrisma } from '../platform/db/client.js';
import { stopCacheBus } from '../platform/events/cacheBus.js';
import { logger } from '../platform/logger/index.js';
import type { StoppableJobs } from '../platform/scheduler/index.js';
import type { SchedulerWorker } from '../platform/scheduler/workerLoop.js';

/** Drain the current durable transaction before disconnecting its pool; leases cover forced exits. */
export function registerShutdown(input: {
  server: Server;
  jobs: StoppableJobs;
  scheduler: SchedulerWorker;
}) {
  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down');
    input.jobs.stop();
    const drained = input.scheduler.stop().catch(() => {
      logger.error({ code: 'SCHEDULER_SHUTDOWN_FAILED' }, 'scheduler shutdown failed');
    });
    input.server.close(() => {
      void drained
        .then(() => stopCacheBus())
        .then(() => disconnectPrisma())
        .finally(() => process.exit(0));
    });
    setTimeout(() => {
      logger.warn('forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
