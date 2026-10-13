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
  readonly poolId?: string;

  /**
   * Create a suppressed account belonging to a durable operation, or reconcile
   * that exact operation's account. Unknown provider accounts are never adopted.
   */
  ensureUser(input: { email: string; displayName: string; role: CommitteeRole; operationId?: string }): Promise<{
    sub: string;
    created: boolean;
    username?: string;
  }>;

  /** Revoke access. Used when a volunteer leaves or loses a device. */
  disableUser(email: string, expectedSubject?: string): Promise<void>;

  /**
   * Restore access to a previously disabled account.
   *
   * Reinstating somebody is an ordinary correction — a volunteer suspended in
   * error, or one who came back — and without this the only remedy would be
   * deleting and re-provisioning them, which would issue a new subject and
   * orphan every capture they had already recorded.
   */
  enableUser(email: string, expectedSubject?: string): Promise<void>;

  /** Cognito resends only an unaccepted temporary-password invite. */
  resendInvite(email: string, expectedSubject?: string): Promise<boolean>;
  hasMfa(email: string, expectedSubject?: string): Promise<boolean>;
  beginMfa(accessToken: string): Promise<string>;
  verifyMfa(input: { accessToken: string; code: string }): Promise<void>;
}
