import type { CommitteeRole } from '@spoh/shared';

/**
 * Account provisioning (BUILD_PLAN §6.1).
 *
 * Self-signup is disabled: accounts exist because someone is on the roster, not
 * because they found the sign-in page. The Chief or an Admin provisions a
 * volunteer, which creates the identity and the `Volunteer` row together.
 *
 * The same pluggable shape as authentication — a Cognito implementation for
 * deployed environments and a deterministic local one for development, so the
 * roster import and the provisioning endpoint are exercised identically in both.
 */
export interface IdentityProvider {
  readonly name: 'cognito' | 'local';

  /**
   * Create (or find) the identity for an email address and put it in the right
   * group. Returns the provider subject to store as `Volunteer.cognitoSub`.
   */
  ensureUser(input: { email: string; displayName: string; role: CommitteeRole }): Promise<{
    sub: string;
    created: boolean;
  }>;

  /** Revoke access. Used when a volunteer leaves or loses a device. */
  disableUser(email: string): Promise<void>;

  /**
   * Restore access to a previously disabled account.
   *
   * Reinstating somebody is an ordinary correction — a volunteer suspended in
   * error, or one who came back — and without this the only remedy would be
   * deleting and re-provisioning them, which would issue a new subject and
   * orphan every capture they had already recorded.
   */
  enableUser(email: string): Promise<void>;
}
