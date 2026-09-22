import { createHash } from 'node:crypto';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminResetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import type { CommitteeRole } from '@spoh/shared';
import { env } from '../../config/env.js';
import { InternalError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

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

  /**
   * Send the sign-in email again.
   *
   * "I never got the email" is the support request of the week before the
   * event. Somebody who has never set a password gets the invite resent with a
   * fresh temporary password; somebody who has gets a reset code instead,
   * because Cognito will not reissue an invite to a confirmed account.
   */
  resendInvite(email: string): Promise<'invite' | 'reset' | 'none'>;
}

/** Cognito group names are PascalCase; `CommitteeRole` values are not. */
const ROLE_TO_COGNITO_GROUP: Readonly<Record<CommitteeRole, string>> = Object.freeze({
  ADMIN: 'Admin',
  LEAD: 'Lead',
  CHIEF_COORDINATOR: 'ChiefCoordinator',
  DEPUTY_COORDINATOR: 'DeputyCoordinator',
  IC: 'IC',
  VOLUNTEER: 'Volunteer',
});

function createCognitoIdentityProvider(userPoolId: string): IdentityProvider {
  const client = new CognitoIdentityProviderClient({ region: env.COGNITO_REGION });

  async function getUser(email: string): Promise<{ sub: string | undefined; status: string }> {
    const result = await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
    );
    return {
      sub: result.UserAttributes?.find((attr) => attr.Name === 'sub')?.Value,
      status: result.UserStatus ?? 'UNKNOWN',
    };
  }

  return {
    name: 'cognito',

    async ensureUser({ email, displayName, role }) {
      let sub: string | undefined;
      let created = false;

      try {
        const result = await client.send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: [
              { Name: 'email', Value: email },
              { Name: 'email_verified', Value: 'true' },
              { Name: 'name', Value: displayName },
            ],
            // Cognito emails the invite and a temporary code; the volunteer
            // sets a password once, at their own convenience, before the event.
            DesiredDeliveryMediums: ['EMAIL'],
          }),
        );

        sub = result.User?.Attributes?.find((attr) => attr.Name === 'sub')?.Value;
        created = true;
      } catch (error) {
        if (!(error instanceof UsernameExistsException)) throw error;
        // The account exists but the roster row does not — a re-run of an
        // import whose transaction failed after the invites went out, or a
        // volunteer from a previous year's pool. One extra round trip, taken
        // only on this path, is what makes the re-run safe rather than a 500.
        logger.info({ email }, 'Cognito user already exists; reusing identity');
        sub = (await getUser(email)).sub;
      }

      if (!sub) {
        throw new InternalError('Cognito did not return a subject for this user');
      }

      await client.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: email,
          GroupName: ROLE_TO_COGNITO_GROUP[role],
        }),
      );

      return { sub, created };
    },

    async disableUser(email) {
      await client.send(new AdminDisableUserCommand({ UserPoolId: userPoolId, Username: email }));
    },

    async enableUser(email) {
      await client.send(new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: email }));
    },

    async resendInvite(email) {
      const { status } = await getUser(email);

      if (status === 'FORCE_CHANGE_PASSWORD') {
        await client.send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            MessageAction: 'RESEND',
            DesiredDeliveryMediums: ['EMAIL'],
          }),
        );
        return 'invite';
      }

      await client.send(
        new AdminResetUserPasswordCommand({ UserPoolId: userPoolId, Username: email }),
      );
      return 'reset';
    },
  };
}

/**
 * Development identity provider.
 *
 * Derives a stable subject from the email so the same person always gets the
 * same `cognitoSub` across database resets — which is what makes seeded fixtures
 * and dev tokens line up. It creates no account anywhere; the local auth
 * provider will accept any token it signs for that subject.
 */
function createLocalIdentityProvider(): IdentityProvider {
  return {
    name: 'local',

    ensureUser({ email }) {
      const sub = `local:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
      return Promise.resolve({ sub, created: true });
    },

    disableUser(email) {
      logger.info({ email }, 'local identity provider: disable is a no-op');
      return Promise.resolve();
    },

    enableUser(email) {
      logger.info({ email }, 'local identity provider: enable is a no-op');
      return Promise.resolve();
    },

    resendInvite(email) {
      logger.info({ email }, 'local identity provider: there is no email to resend');
      return Promise.resolve('none');
    },
  };
}

export const identityProvider: IdentityProvider =
  env.AUTH_PROVIDER === 'cognito'
    ? createCognitoIdentityProvider(env.COGNITO_USER_POOL_ID as string)
    : createLocalIdentityProvider();
