import { env } from '../../../config/env.js';
import { systemClock } from '../../time/index.js';
import { cloudReadinessCache } from './cache.js';
import { collectCloudReadiness } from './ports.js';
import { cloudReadinessReaders } from './readers.js';
import type { CloudReadinessSnapshot } from './ports.js';

function configuredReader(): () => Promise<CloudReadinessSnapshot | undefined> {
  const config = env.READINESS_CLOUD_CONFIG;
  if (!config) return async () => undefined;
  const now = () => systemClock.now().getTime();
  const readers = cloudReadinessReaders(config, { now, fetch });
  return cloudReadinessCache({ now,
    maxAgeMs: Math.min(30_000, ...Object.values(config.freshness).map(value => value / 2)),
    collect: () => collectCloudReadiness(config, readers),
  });
}

/** Caller preparation happens before business locks; domain evaluation rechecks the clock under them. */
export const readCloudReadiness = configuredReader();
