import { isTest } from '../../config/env.js';
import { logger } from '../logger/index.js';
import { cacheBusStatus } from './cacheBus.js';

// Security-cache degradation must remain observable when normal application logs are raised.
const metricsLogger = logger.child({ metric: 'cache-bus' }, { level: isTest ? 'silent' : 'info' });

/** Called before each worker claim, including polls whose database work subsequently fails. */
export function recordCacheBusMetrics(
  output: { info(fields: { cacheBusDegraded: number }, message: string): void } = metricsLogger,
): void {
  output.info(
    { cacheBusDegraded: cacheBusStatus() === 'connected' ? 0 : 1 },
    'cache bus connection metrics',
  );
}
