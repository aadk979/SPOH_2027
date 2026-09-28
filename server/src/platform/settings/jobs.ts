import type { ScheduledJob } from '../scheduler/index.js';
import { loadSettings } from './index.js';

/**
 * How long a settings change takes to reach an instance that did not make it.
 *
 * A write refreshes its own instance immediately; this is what brings the
 * others into line. One minute is the right trade for values that change a
 * handful of times across the event's life — long enough to cost nothing, short
 * enough that an admin who moves a shift boundary sees it take effect while
 * they are still looking at the screen.
 */
const SETTINGS_REFRESH_MS = 60 * 1000;

/** Converge on settings changed by another instance. */
export const settingsJobs: readonly ScheduledJob[] = [
  { name: 'settings refresh', intervalMs: SETTINGS_REFRESH_MS, run: () => loadSettings() },
];
