import type { Request } from 'express';
import type { AuditContext } from '../audit/index.js';
import { getAuth } from '../identity/index.js';
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
  /**
   * Present when an IC-or-above wrote to a station they are not rostered on.
   * The capture services pass this to `auditStationScopeBypass` so the write is
   * distinguishable during reconciliation.
   */
  stationScopeBypass?: { stationId: string };
}

/** What a capture use case needs besides its input: who, the audit trail, and now. */
export interface CaptureContext {
  actor: CaptureActor;
  audit: AuditContext;
  /** Defaults to the system clock; tests pass a fixed one. */
  clock?: Clock;
}

export function captureContextFrom(req: Request): CaptureContext {
  return { actor: captureActorFrom(req), audit: auditContextFrom(req) };
}

export function captureActorFrom(req: Request): CaptureActor {
  const auth = getAuth(req);
  return {
    volunteerId: auth.volunteerId,
    ...(auth.stationScopeBypass ? { stationScopeBypass: auth.stationScopeBypass } : {}),
  };
}
