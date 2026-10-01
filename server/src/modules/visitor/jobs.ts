import { purgeVisitorData } from './application/purgeVisitorData.js';

/** The visitor data retention handler (ADR-003 §8); P10.7 moves it to the job table. */
export const visitorJobs = [
  { name: 'visitor data purge', intervalMs: 60 * 60 * 1000, run: () => purgeVisitorData() },
] as const;
