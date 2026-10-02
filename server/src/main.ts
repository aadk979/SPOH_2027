import { createApp } from './app/createApp.js';
import { env } from './config/env.js';
import { logger } from './platform/logger/index.js';
import { pingDatabase } from './platform/db/client.js';
import { loadSettings } from './platform/settings/index.js';
import { JOBS } from './app/jobs.js';
import { startJobs } from './platform/scheduler/index.js';
import { startCacheBus } from './platform/events/cacheBus.js';
import { registerShutdown } from './app/shutdown.js';
import { startScheduledJobs } from './app/startScheduledJobs.js';

/**
 * The server's start-up, top to bottom: database, settings, app, jobs, listen,
 * and a graceful shutdown.
 *
 * Fails fast on a database it cannot reach: a server that accepts a booth tap
 * and then cannot store it is worse than one that never started, because the
 * volunteer believes the visitor was counted.
 */
async function main(): Promise<void> {
  await pingDatabase();

  // Runtime settings before the first request, so no capture is ever scoped
  // against the compiled shift boundaries when a configured one exists. Total
  // by design: a failure here logs and leaves the defaults in place rather than
  // stopping the server.
  await loadSettings();
  await startCacheBus();

  const app = createApp();
  const scheduler = await startScheduledJobs();
  const jobs = startJobs(JOBS);

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server listening');
  });

  registerShutdown({ server, jobs, scheduler });
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'server failed to start');
  process.exit(1);
});
