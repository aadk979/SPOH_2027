import type { Request } from 'express';
import type { AuditContext } from '../audit/index.js';
import type { EventScope } from '../db/eventScope.js';
import { getAuth } from './requireAuth.js';
import type { Clock } from '../time/clock.js';
import { auditContextFrom } from './auditContext.js';

/**
 * Who is performing a capture write.
 *
 * Built only from `req.auth`, which is populated only from a verified token.
 * A capture is never attributed to a volunteerId taken from a request body
 * (BUILD_PLAN §8.5).
 */
export interface CaptureActor {
  volunteerId: string;
  /** Their EventMembership in the request's event: who the capture is recorded by. */
  membershipId: string;
}

/** What a capture use case needs besides its input: who, the audit trail, and now. */
export interface CaptureContext {
  actor: CaptureActor;
  /** The event the capture belongs to (ADR-001 §2). */
  scope: EventScope;
  audit: AuditContext;
  /** Defaults to the system clock; tests pass a fixed one. */
  clock?: Clock;
}

export function captureContextFrom(req: Request): CaptureContext {
  return {
    actor: captureActorFrom(req),
    scope: { eventId: getAuth(req).eventId },
    audit: auditContextFrom(req),
  };
}

export function captureActorFrom(req: Request): CaptureActor {
  const auth = getAuth(req);
  return {
    volunteerId: auth.volunteerId,
    membershipId: auth.membershipId,
  };
}
