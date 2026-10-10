import { createApp } from './app/createApp.js';
import { env } from './config/env.js';
import { logger } from './platform/logger/index.js';
import { pingDatabase, warmPool } from './platform/db/client.js';
import { JOBS } from './app/jobs.js';
import { startJobs } from './platform/scheduler/index.js';
import { startCacheBus, subscribeCacheEvent } from './platform/events/cacheBus.js';
import { createAuthorizer } from './platform/access/authorizer/index.js';
import { useAuthorizer } from './platform/access/engine.js';
import { registerShutdown } from './app/shutdown.js';
import { applyHttpTimeouts } from './app/httpTimeouts.js';
import { startScheduledJobs } from './app/startScheduledJobs.js';

/**
 * The server's start-up, top to bottom: database, cache bus, app, jobs, listen,
 * and a graceful shutdown.
 *
 * Fails fast on a database it cannot reach: a server that accepts a booth tap
 * and then cannot store it is worse than one that never started, because the
 * volunteer believes the visitor was counted. Then opens the pool's floor, so the
 * first requests after a deploy do not each wait for a new connection.
 */
async function main(): Promise<void> {
  await pingDatabase();
  await warmPool();

  await startCacheBus();
  // AVP behind the decision cache and breaker where the environment has a store (P11.6);
  // the local engine otherwise. The cache drops an event's answers on the access channel.
  if (env.AVP_POLICY_STORE_ID) {
    useAuthorizer(
      createAuthorizer({
        policyStoreId: env.AVP_POLICY_STORE_ID,
        region: env.AWS_REGION,
        ...(env.AVP_POLICY_NAMES ? { policyNames: env.AVP_POLICY_NAMES } : {}),
        log: logger,
        subscribe: subscribeCacheEvent,
      }),
    );
  }

  const app = createApp();
  const scheduler = await startScheduledJobs();
  const jobs = startJobs(JOBS);

  const server = applyHttpTimeouts(
    app.listen(env.PORT, () => {
      logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server listening');
    }),
  );

  registerShutdown({ server, jobs, scheduler });
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'server failed to start');
  process.exit(1);
});
