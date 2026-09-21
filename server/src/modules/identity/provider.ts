import { createHash } from 'node:crypto';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
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
        // Re-provisioning an existing volunteer is a normal operation — a role
        // change, or a re-run of the roster import — and must not fail.
        logger.info({ email }, 'Cognito user already exists; reusing identity');
      }

      if (!sub) {
        // AdminCreateUser does not return attributes for an existing user, and
        // AdminGetUser would be a second round trip per row during a 200-row
        // roster import. The caller resolves the existing row by email instead.
        throw new InternalError(
          'Cognito did not return a subject for this user; resolve the existing volunteer by email',
        );
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
  };
}

export const identityProvider: IdentityProvider =
  env.AUTH_PROVIDER === 'cognito'
    ? createCognitoIdentityProvider(env.COGNITO_USER_POOL_ID as string)
    : createLocalIdentityProvider();
