import type { Capability, CommitteeRole } from '@spoh/shared';

/**
 * Request augmentation.
 *
 * `req.auth` is populated only by `requireAuth`, and is the sole source of
 * caller identity anywhere in the server. No handler reads a volunteerId, role
 * or station from a request body for authorization purposes (BUILD_PLAN §8.5).
 */
export interface RequestAuth {
  /** Identity-provider subject from the verified token. */
  sub: string;
  /** All committee roles the token's group claims map to. */
  groups: CommitteeRole[];
  /** Highest-precedence role among `groups`. Drives the capability lookup. */
  role: CommitteeRole;
  /** `Volunteer.id`, resolved from `sub`. */
  volunteerId: string;
  displayName: string;
  /** Capabilities granted by `role`, computed from the shared matrix. */
  capabilities: Capability[];
  /**
   * Set when an IC-or-above wrote to a station they are not rostered on.
   * The write is allowed, but the service records it in the audit log inside
   * the same transaction as the mutation (BUILD_PLAN §6.3).
   */
  stationScopeBypass?: { stationId: string };
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Present only after `requireAuth` has run.
       *
       * The correlation id lives on `req.id`, declared by pino-http as its
       * `ReqId` union — read it through `requestIdOf()` in
       * `middleware/requestId.ts` rather than assuming a string.
       */
      auth?: RequestAuth;
    }
  }
}
