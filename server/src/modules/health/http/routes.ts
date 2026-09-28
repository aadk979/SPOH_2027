import { Router } from 'express';
import { livenessHandler, readinessHandler } from './handlers.js';

/**
 * Liveness and readiness (BUILD_PLAN §7.2).
 *
 * The only two unauthenticated routes in the system. Neither leaks detail: a
 * failing readiness probe says "not ready", not "connection to
 * spoh-prod.abc123.ap-southeast-1.rds.amazonaws.com refused".
 */
export const healthRouter: Router = Router();

/** Liveness: is the process up. Touches nothing, so it cannot fail spuriously. */
healthRouter.get('/healthz', livenessHandler);

/** Readiness: can the process serve traffic — which means, can it reach Postgres. */
healthRouter.get('/readyz', readinessHandler);
