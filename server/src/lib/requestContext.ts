import type { Request } from 'express';
import { requestIdOf } from '../middleware/requestId.js';
import type { AuditContext } from './audit.js';

/**
 * Derives the audit context from a request.
 *
 * Everything here comes from the verified token or the transport, never from
 * the request body — attribution that a client could set is not attribution
 * (BUILD_PLAN §8.5).
 */
export function auditContextFrom(req: Request): AuditContext {
  return {
    actorId: req.auth?.volunteerId ?? null,
    actorSub: req.auth?.sub ?? null,
    ip: req.ip ?? null,
    // Truncated: a user-agent string is attacker-controlled and unbounded.
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
    requestId: requestIdOf(req),
  };
}

/** The system actor, for scheduled jobs that have no request behind them. */
export const SYSTEM_AUDIT_CONTEXT: AuditContext = Object.freeze({
  actorId: null,
  actorSub: 'system',
  ip: null,
  userAgent: null,
  requestId: null,
});
