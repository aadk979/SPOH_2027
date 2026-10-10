import type { Request } from 'express';
import { requestIdOf } from './requestId.js';
import type { AuditContext } from '../audit/index.js';
import type { EventScope } from '../db/eventScope.js';
import { getAuth } from './requireAuth.js';

/**
 * Derives the audit context from a request.
 *
 * Everything here comes from the verified token or the transport, never from
 * the request body — attribution that a client could set is not attribution
 * (BUILD_PLAN §8.5).
 */
/** The caller's half of the context; nulls before sign-in. */
function actorOf(
  req: Request,
): Pick<AuditContext, 'actorId' | 'actorSub' | 'eventId' | 'membershipId'> {
  const auth = req.auth;
  if (!auth) return { actorId: req.person?.personId ?? null, actorSub: req.person?.sub ?? null,
    eventId: null, membershipId: null };
  return {
    actorId: auth.volunteerId,
    actorSub: auth.sub,
    eventId: auth.eventId,
    membershipId: auth.membershipId,
  };
}

export function auditContextFrom(req: Request): AuditContext {
  return {
    ...actorOf(req),
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
  eventId: null,
  membershipId: null,
  ip: null,
  userAgent: null,
  requestId: null,
});

/** Who is acting and the audit trail, for a use case that is not a capture. */
export interface ActorContext {
  volunteerId: string;
  /** Their EventMembership in the request's event. */
  membershipId: string;
  /** The event the request works in (ADR-001 §2). */
  scope: EventScope;
  audit: AuditContext;
}

export function actorContextFrom(req: Request): ActorContext {
  const auth = getAuth(req);
  return {
    volunteerId: auth.volunteerId,
    membershipId: auth.membershipId,
    scope: { eventId: auth.eventId },
    audit: auditContextFrom(req),
  };
}
