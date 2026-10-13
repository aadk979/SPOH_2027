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
import { InternalError, ValidationError, ConflictError } from '../errors/index.js';
import { ERROR_CODES } from '@spoh/shared';
import type { IdentityProvider } from './provisioning.js';
import type { AdminGetUserCommandOutput } from '@aws-sdk/client-cognito-identity-provider';

interface Pool {
  client: CognitoIdentityProviderClient;
  userPoolId: string;
}
const getUser = (pool: Pool, email: string) =>
  pool.client.send(new AdminGetUserCommand({ UserPoolId: pool.userPoolId, Username: email }),
    { abortSignal: AbortSignal.timeout(10_000) });

async function ensureUser(pool: Pool, input: { email: string; displayName: string; operationId?: string }) {
  if (!input.operationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.operationId))
    throw new ValidationError('A durable identity operation is required.');
  let created = true;
  try {
    await pool.client.send(
      new AdminCreateUserCommand({
        UserPoolId: pool.userPoolId,
        Username: input.email,
        MessageAction: 'SUPPRESS',
        DesiredDeliveryMediums: ['EMAIL'],
        UserAttributes: [
          { Name: 'email', Value: input.email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: input.displayName },
          { Name: 'custom:spoh_operation', Value: input.operationId },
        ],
      }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
  } catch (error) {
    if (!(error instanceof UsernameExistsException)) throw error;
    created = false;
  }
  const user = await getUser(pool, input.email);
  const proof = proveCreatedUser(user, input);
  return { ...proof, created };
}

function proveCreatedUser(user: AdminGetUserCommandOutput,
  input: { email: string; displayName: string; operationId?: string }) {
  const attributes = new Map(user.UserAttributes?.map(({ Name, Value }) => [Name, Value]));
  const sub = attributes.get('sub');
  if (!sub || !user.Username || !enabledAccount(user) ||
    attributes.get('email')?.trim().toLowerCase() !== input.email.trim().toLowerCase() ||
    attributes.get('email_verified') !== 'true' || attributes.get('name') !== input.displayName ||
    attributes.get('custom:spoh_operation') !== input.operationId)
    throw new ConflictError(ERROR_CODES.CONFLICT, 'This identity account cannot be reconciled with the planned operation.');
  return { sub, username: user.Username };
}

function enabledAccount(user: AdminGetUserCommandOutput) {
  return user.Enabled === true && ['FORCE_CHANGE_PASSWORD', 'CONFIRMED'].includes(user.UserStatus ?? '');
}

async function resendInvite(pool: Pool, email: string, expectedSubject?: string) {
  const user = await provenUser(pool, email, expectedSubject);
  if (user.UserStatus !== 'FORCE_CHANGE_PASSWORD') return false;
  await pool.client.send(
    new AdminCreateUserCommand({
      UserPoolId: pool.userPoolId,
      Username: user.Username,
      MessageAction: 'RESEND',
      DesiredDeliveryMediums: ['EMAIL'],
    }),
    { abortSignal: AbortSignal.timeout(10_000) },
  );
  return true;
}

async function provenUser(pool: Pool, email: string, expectedSubject?: string) {
  const user = await matchingUser(pool, email, expectedSubject);
  if (user.Enabled !== true)
    throw new ConflictError(ERROR_CODES.CONFLICT, 'The provider account no longer matches this person.');
  return user;
}

async function matchingUser(pool: Pool, email: string, expectedSubject?: string) {
  const user = await getUser(pool, email);
  const attributes = new Map(user.UserAttributes?.map(({ Name, Value }) => [Name, Value]));
  if (!expectedSubject || !user.Username || attributes.get('sub') !== expectedSubject ||
    !['FORCE_CHANGE_PASSWORD', 'CONFIRMED'].includes(user.UserStatus ?? '') ||
    attributes.get('email_verified') !== 'true' ||
    attributes.get('email')?.trim().toLowerCase() !== email.trim().toLowerCase())
    throw new ConflictError(ERROR_CODES.CONFLICT, 'The provider account no longer matches this person.');
  return user;
}

async function verifyMfa(pool: Pool, input: { accessToken: string; code: string }) {
  const result = await pool.client.send(
    new VerifySoftwareTokenCommand({ AccessToken: input.accessToken, UserCode: input.code }),
    { abortSignal: AbortSignal.timeout(10_000) },
  );
  if (result.Status !== 'SUCCESS')
    throw new ValidationError('The authenticator code was not accepted. Try the next code.');
  await pool.client.send(
    new SetUserMFAPreferenceCommand({
      AccessToken: input.accessToken,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
    }),
    { abortSignal: AbortSignal.timeout(10_000) },
  );
}

/** Cognito authenticates identities; roles and permissions never create or read groups (ADR-006 §7). */
export function createCognitoIdentityProvider(userPoolId: string): IdentityProvider {
  const pool = {
    userPoolId,
    // Each durable invitation reserves one allowance for exactly one SDK send.
    client: new CognitoIdentityProviderClient({ region: env.COGNITO_REGION, maxAttempts: 1 }),
  };
  return {
    name: 'cognito',
    poolId: userPoolId,
    ensureUser: (input) => ensureUser(pool, input),
    disableUser: async (email, expectedSubject) => {
      const user = await matchingUser(pool, email, expectedSubject);
      await pool.client.send(
        new AdminDisableUserCommand({ UserPoolId: userPoolId, Username: user.Username }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
    },
    enableUser: async (email, expectedSubject) => {
      const user = await matchingUser(pool, email, expectedSubject);
      await pool.client.send(
        new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: user.Username }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
    },
    resendInvite: (email, expectedSubject) => resendInvite(pool, email, expectedSubject),
    hasMfa: async (email, expectedSubject) =>
      (await provenUser(pool, email, expectedSubject)).UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA') ?? false,
    beginMfa: async (accessToken) => {
      const result = await pool.client.send(
        new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      if (!result.SecretCode)
        throw new InternalError('Cognito did not return an authenticator secret');
      return result.SecretCode;
    },
    verifyMfa: (input) => verifyMfa(pool, input),
  };
}
