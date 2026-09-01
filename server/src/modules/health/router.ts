import { Router, type Request, type Response } from 'express';
import { pingDatabase } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

/**
 * Liveness and readiness (BUILD_PLAN §7.2).
 *
 * The only two unauthenticated routes in the system. Neither leaks detail: a
 * failing readiness probe says "not ready", not "connection to
 * spoh-prod.abc123.ap-southeast-1.rds.amazonaws.com refused".
 */
export const healthRouter: Router = Router();

/** Liveness: is the process up. Touches nothing, so it cannot fail spuriously. */
healthRouter.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

/** Readiness: can the process serve traffic — which means, can it reach Postgres. */
healthRouter.get('/readyz', async (req: Request, res: Response) => {
  try {
    await pingDatabase();
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'readiness check failed');
    res.status(503).json({ status: 'not_ready' });
  }
});
