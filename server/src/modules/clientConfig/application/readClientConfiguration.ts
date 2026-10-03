import { ClientConfigurationSchema, type ClientConfiguration } from '@spoh/shared';
import { env, type Env } from '../../../config/env.js';

type PublicEnvironment = Pick<
  Env,
  | 'NODE_ENV'
  | 'DEPLOYMENT_ENV'
  | 'AUTH_PROVIDER'
  | 'APP_BASE_URL'
  | 'COGNITO_REGION'
  | 'COGNITO_USER_POOL_ID'
  | 'COGNITO_CLIENT_ID'
  | 'COGNITO_DOMAIN'
>;

/** Build only the public allowlist; never spread the environment into a response. */
export function readClientConfiguration(source: PublicEnvironment = env): ClientConfiguration {
  return ClientConfigurationSchema.parse({
    version: 1,
    apiBaseUrl: source.APP_BASE_URL?.replace(/\/$/, '') ?? '',
    envLabel: source.DEPLOYMENT_ENV ?? source.NODE_ENV,
    authProvider: source.AUTH_PROVIDER,
    cognito:
      source.AUTH_PROVIDER === 'cognito'
        ? {
            region: source.COGNITO_REGION,
            userPoolId: source.COGNITO_USER_POOL_ID,
            clientId: source.COGNITO_CLIENT_ID,
            domain: source.COGNITO_DOMAIN?.replace(/\/$/, ''),
          }
        : null,
  });
}
