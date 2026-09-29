import { Router, type NextFunction, type Request, type Response } from 'express';
import { livenessHandler, readinessHandler } from './handlers.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** From the socket, not X-Forwarded-For, so no header can claim to be local. */
export function isLoopback(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK.has(address);
}

/**
 * Readiness queries the database, so it answers only the container's own
 * health check: behind the load balancer or API Gateway it is a 404 like any
 * unknown path (F04-008, ADR-008 §1).
 */
function loopbackOnly(req: Request, _res: Response, next: NextFunction): void {
  next(isLoopback(req.socket.remoteAddress) ? undefined : 'route');
}

/**
 * Liveness and readiness (BUILD_PLAN §7.2).
 *
 * The only two unauthenticated routes in the system, and only liveness is
 * public. Neither leaks detail: a
 * failing readiness probe says "not ready", not "connection to
 * spoh-prod.abc123.ap-southeast-1.rds.amazonaws.com refused".
 */
export const healthRouter: Router = Router();

/** Liveness: is the process up. Touches nothing, so it cannot fail spuriously. */
healthRouter.get('/healthz', livenessHandler);

/** Readiness: can the process serve traffic — which means, can it reach Postgres. */
healthRouter.get('/readyz', loopbackOnly, readinessHandler);
