import type { ScheduledJob } from '../platform/scheduler/index.js';
import { identityCacheJobs } from '../platform/identity/jobs.js';
import { logDecisionSummary } from '../platform/http/decisionTally.js';
import { logAvpSummary } from '../platform/access/authorizer/avpTally.js';
import { logger } from '../platform/logger/index.js';

const FIVE_MINUTES = 300_000;

/**
 * The per-instance summaries the authorization metrics read (P11.5, P11.9). Each instance
 * counts only its own decisions, so these are local ticks rather than durable actions.
 */
const authorizationSummaryJobs: readonly ScheduledJob[] = [
  {
    name: 'authorization summary',
    intervalMs: FIVE_MINUTES,
    run: async () =>
      logDecisionSummary((tally) => logger.info({ authorization: tally }, 'authorization summary')),
  },
  {
    name: 'avp summary',
    intervalMs: FIVE_MINUTES,
    run: async () => logAvpSummary((tally) => logger.info({ avp: tally }, 'avp summary')),
  },
];

/**
 * Per-instance cache maintenance and metric summaries: the only timers outside the durable
 * scheduler (ADR-004 §4). Business actions use the scheduler registry.
 */
export const JOBS: readonly ScheduledJob[] = [...identityCacheJobs, ...authorizationSummaryJobs];
