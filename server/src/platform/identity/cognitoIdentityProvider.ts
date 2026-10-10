import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { env } from '../../config/env.js';
import { InternalError, ValidationError } from '../errors/index.js';
import type { IdentityProvider } from './provisioning.js';

interface Pool {
  client: CognitoIdentityProviderClient;
  userPoolId: string;
}
const getUser = (pool: Pool, email: string) =>
  pool.client.send(new AdminGetUserCommand({ UserPoolId: pool.userPoolId, Username: email }));

async function ensureUser(pool: Pool, input: { email: string; displayName: string }) {
  try {
    const result = await pool.client.send(
      new AdminCreateUserCommand({
        UserPoolId: pool.userPoolId,
        Username: input.email,
        DesiredDeliveryMediums: ['EMAIL'],
        UserAttributes: [
          { Name: 'email', Value: input.email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: input.displayName },
        ],
      }),
    );
    const sub = result.User?.Attributes?.find((attr) => attr.Name === 'sub')?.Value;
    if (!sub) throw new InternalError('Cognito did not return a subject for this user');
    return { sub, created: true };
  } catch (error) {
    if (!(error instanceof UsernameExistsException)) throw error;
    const user = await getUser(pool, input.email);
    const sub = user.UserAttributes?.find((attr) => attr.Name === 'sub')?.Value;
    if (!sub) throw new InternalError('Cognito did not return a subject for this user');
    return { sub, created: false };
  }
}

async function resendInvite(pool: Pool, email: string) {
  if ((await getUser(pool, email)).UserStatus !== 'FORCE_CHANGE_PASSWORD') return false;
  await pool.client.send(
    new AdminCreateUserCommand({
      UserPoolId: pool.userPoolId,
      Username: email,
      MessageAction: 'RESEND',
      DesiredDeliveryMediums: ['EMAIL'],
    }),
  );
  return true;
}

async function verifyMfa(pool: Pool, input: { accessToken: string; code: string }) {
  const result = await pool.client.send(
    new VerifySoftwareTokenCommand({ AccessToken: input.accessToken, UserCode: input.code }),
  );
  if (result.Status !== 'SUCCESS')
    throw new ValidationError('The authenticator code was not accepted. Try the next code.');
  await pool.client.send(
    new SetUserMFAPreferenceCommand({
      AccessToken: input.accessToken,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
    }),
  );
}

/** Cognito authenticates identities; roles and permissions never create or read groups (ADR-006 §7). */
export function createCognitoIdentityProvider(userPoolId: string): IdentityProvider {
  const pool = {
    userPoolId,
    client: new CognitoIdentityProviderClient({ region: env.COGNITO_REGION }),
  };
  return {
    name: 'cognito',
    ensureUser: (input) => ensureUser(pool, input),
    disableUser: async (email) => {
      await pool.client.send(
        new AdminDisableUserCommand({ UserPoolId: userPoolId, Username: email }),
      );
    },
    enableUser: async (email) => {
      await pool.client.send(
        new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: email }),
      );
    },
    resendInvite: (email) => resendInvite(pool, email),
    hasMfa: async (email) =>
      (await getUser(pool, email)).UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA') ?? false,
    beginMfa: async (accessToken) => {
      const result = await pool.client.send(
        new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
      );
      if (!result.SecretCode)
        throw new InternalError('Cognito did not return an authenticator secret');
      return result.SecretCode;
    },
    verifyMfa: (input) => verifyMfa(pool, input),
  };
}
