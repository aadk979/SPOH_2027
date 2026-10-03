import { randomUUID } from 'node:crypto';
import { isTest } from '../../config/env.js';
import { logger } from '../logger/index.js';
import { systemClock, type Clock } from '../time/index.js';
import { claimDueActions } from './claimDueActions.js';
import { readSchedulerMetrics } from './metricsRepo.js';
import type { HandlerRegistry } from './registry.js';
import { runClaimedAction } from './runClaimedAction.js';
import { startWorkerLoop } from './workerLoop.js';

// Queue gauges must survive a raised application log threshold; tests still remain silent.
const metricsLogger = logger.child({ metric: 'scheduler' }, { level: isTest ? 'silent' : 'info' });

/** P08.8 can filter these gauges from each environment's existing application log group. */
export function startSchedulerWorker(input: {
  registry: HandlerRegistry;
  clock?: Clock;
  workerId?: string;
  beforeClaim?: () => Promise<void>;
  afterActions?: () => Promise<void>;
}) {
  const clock = input.clock ?? systemClock;
  const workerId = input.workerId ?? randomUUID();
  if (!workerId.trim()) throw new Error('A scheduler worker ID is required');
  const types = input.registry.types();
  return startWorkerLoop({
    claim: async () => {
      await input.beforeClaim?.();
      return claimDueActions({ workerId, types, clock });
    },
    execute: (claim) => runClaimedAction({ claim, registry: input.registry, clock }),
    afterActions: input.afterActions,
    async recordMetrics() {
      const metrics = await readSchedulerMetrics({ types, now: clock.now() });
      metricsLogger.info(metrics, 'scheduler queue metrics');
    },
    pollFailed: () => logger.error({ code: 'SCHEDULER_POLL_FAILED' }, 'scheduler poll failed'),
  });
}
