import type { CommitteeRole } from '@spoh/shared';

/**
 * The identity contract every authentication provider must satisfy.
 *
 * Only two things ever come out of a token: the subject and the group list.
 * Everything else — which volunteer this is, which station they are on, what
 * they may do — is looked up server-side from the database. A client-supplied
 * role, volunteerId or stationId is never trusted for authorization
 * (BUILD_PLAN §6.2, §8.5).
 */
export interface VerifiedToken {
  /** Identity-provider subject. Stable for the life of the account. */
  sub: string;
  /** Group memberships, already filtered to known committee roles. */
  groups: CommitteeRole[];
}

export interface AuthProvider {
  /** Human-readable name, logged once at boot so the active mode is obvious. */
  readonly name: 'cognito' | 'local';

  /**
   * Verify a bearer token. Throws `UnauthenticatedError` on any failure.
   * Implementations must not leak verification detail to the caller — the
   * reason goes to the server log with the request id, the client gets a
   * generic 401.
   */
  verify(token: string): Promise<VerifiedToken>;
}
