import { createApp } from './app.js';
import { env } from './config/env.js';
import { cloudWatchEnabled, flushCloudWatch } from './lib/cloudwatch.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma, pingDatabase } from './lib/prisma.js';
import { loadSettings } from './lib/settings.js';
import { startScheduledJobs } from './jobs/scheduler.js';

/**
 * Process entrypoint.
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

  const app = createApp();
  const jobs = startScheduledJobs();

  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        cloudWatch: cloudWatchEnabled
          ? { auditLogGroup: env.CLOUDWATCH_AUDIT_LOG_GROUP ?? env.CLOUDWATCH_LOG_GROUP }
          : 'disabled',
      },
      'spoh-server listening',
    );
  });

  // Give in-flight capture writes a chance to finish before the process exits.
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    jobs.stop();

    server.close(() => {
      // Drain the log buffer before the connection pool: an audit row written
      // in the last second of the process is the one most worth keeping, and
      // flushCloudWatch is bounded so this cannot stall the deploy.
      void flushCloudWatch()
        .then(() => disconnectPrisma())
        .finally(() => process.exit(0));
    });

    // Hard limit: a deploy must not hang on a stuck connection.
    setTimeout(() => {
      logger.warn('forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'server failed to start');
  process.exit(1);
});
