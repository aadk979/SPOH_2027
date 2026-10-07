import { SETTINGS } from '../../../platform/settings/registry.js';

/**
 * How long a resolved alert keeps its descriptive fields (BUILD_PLAN §5.9). The
 * shipped default; the live value is a runtime setting. Shortening it is the
 * safer direction — the only cost is that a report run the morning after has
 * to lean on the unpurged count.
 */
export const PURGE_AFTER_HOURS = SETTINGS.lostPersonPurgeHours.default;

/** The idempotency endpoint name of `POST /lost-person`. */
export const RAISE_ENDPOINT = 'POST /lost-person';
