import type { ScheduledJob } from '../scheduler/index.js';
import { loadSettings } from './index.js';
import { isCacheBusDegraded } from '../events/cacheBus.js';

/** A full refresh backs up missed notifications; degraded instances poll faster. */
const SETTINGS_REFRESH_MS = 60 * 1000;

/** Keep settings current after missed notifications or a bus outage. */
export const settingsJobs: readonly ScheduledJob[] = [
  { name: 'settings refresh', intervalMs: SETTINGS_REFRESH_MS, run: () => loadSettings() },
  {
    name: 'degraded settings refresh',
    intervalMs: 5_000,
    run: async () => {
      if (isCacheBusDegraded()) await loadSettings();
    },
  },
];
