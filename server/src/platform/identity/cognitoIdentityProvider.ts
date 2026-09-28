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
import { InternalError } from '../errors/index.js';
import { logger } from '../logger/index.js';
import type { IdentityProvider } from './provisioning.js';

/** Cognito group names are PascalCase; `CommitteeRole` values are not. */
const ROLE_TO_COGNITO_GROUP: Readonly<Record<CommitteeRole, string>> = Object.freeze({
  ADMIN: 'Admin',
  LEAD: 'Lead',
  CHIEF_COORDINATOR: 'ChiefCoordinator',
  DEPUTY_COORDINATOR: 'DeputyCoordinator',
  IC: 'IC',
  VOLUNTEER: 'Volunteer',
});

export function createCognitoIdentityProvider(userPoolId: string): IdentityProvider {
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
