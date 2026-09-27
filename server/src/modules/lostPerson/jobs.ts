import { purgeResolvedAlerts } from './application/purgeResolvedAlerts.js';

/**
 * The scheduled handlers this module registers (engineering-standards §3).
 * The scheduler still wraps setInterval; P10 moves it to the job table.
 */
export const lostPersonJobs = [
  { name: 'lost-person purge', intervalMs: 15 * 60 * 1000, run: purgeResolvedAlerts },
] as const;
