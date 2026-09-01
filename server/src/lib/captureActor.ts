import type { Request } from 'express';
import { getAuth } from '../middleware/auth/index.js';

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

export function captureActorFrom(req: Request): CaptureActor {
  const auth = getAuth(req);
  return {
    volunteerId: auth.volunteerId,
    ...(auth.stationScopeBypass ? { stationScopeBypass: auth.stationScopeBypass } : {}),
  };
}
