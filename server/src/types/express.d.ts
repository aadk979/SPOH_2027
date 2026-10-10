import type { CommitteeRole } from '@spoh/shared';

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
  /** Highest-precedence role among `groups`: the membership's role in this event. */
  role: CommitteeRole;
  /** `Volunteer.id`, resolved from `sub`. */
  volunteerId: string;
  /** The event this request works in (ADR-001; the current event until P09.7). */
  eventId: string;
  /** The caller's EventMembership in that event, where role and standing live. */
  membershipId: string;
  displayName: string;
  /**
   * The RefreshSession backing this request, when the caller presented an
   * access token this API issued. Absent for an identity-provider token, which
   * has no session row and therefore cannot be revoked before it expires.
   */
  sessionId?: string;
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Present only after `requireAuth` has run.
       *
       * The correlation id lives on `req.id`, declared by pino-http as its
       * `ReqId` union — read it through `requestIdOf()` in
       * `platform/http/requestId.ts` rather than assuming a string.
       */
      auth?: RequestAuth;
      /**
       * The event the request works in, set before authentication by the
       * event-context middleware (`platform/http/eventContext.ts`): the path's
       * `:eventId`, or Event #1 on an alias path.
       */
      requestedEvent?: { eventId: string; fromPath: boolean };
      /** Present only after `requirePerson`, on platform routes about the person (ADR-001 §4). */
      person?: { sub: string; personId: string };
    }
  }
}
