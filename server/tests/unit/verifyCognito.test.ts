import { expect, it } from 'vitest';
// @ts-expect-error -- Import the actual operator script, which has no declaration file.
import { configurationChecks } from '../../scripts/verify-cognito.mjs';
const pool = {
  AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
  UsernameAttributes: ['email'],
  Policies: {
    PasswordPolicy: {
      MinimumLength: 12,
      RequireLowercase: true,
      RequireUppercase: true,
      RequireNumbers: true,
      RequireSymbols: true,
      TemporaryPasswordValidityDays: 30,
    },
  },
  MfaConfiguration: 'OPTIONAL',
  EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
};
const client = {
  AccessTokenValidity: 5,
  IdTokenValidity: 5,
  RefreshTokenValidity: 60,
  TokenValidityUnits: { AccessToken: 'minutes', IdToken: 'minutes', RefreshToken: 'minutes' },
  AllowedOAuthFlowsUserPoolClient: true,
  AllowedOAuthFlows: ['code'],
  EnableTokenRevocation: true,
  PreventUserExistenceErrors: 'ENABLED',
  AllowedOAuthScopes: ['openid', 'aws.cognito.signin.user.admin'],
};
it('accepts the definition without groups, SES or password grants', () => {
  expect(configurationChecks(pool, client).every(([, passed]: [string, boolean]) => passed)).toBe(
    true,
  );
});
it('rejects obsolete token/password settings and absent descriptions', () => {
  const old = {
    ...client,
    AccessTokenValidity: 60,
    RefreshTokenValidity: 12,
    ExplicitAuthFlows: ['ALLOW_ADMIN_USER_PASSWORD_AUTH'],
  };
  const failures = configurationChecks(pool, old).filter(
    ([, passed]: [string, boolean]) => !passed,
  );
  expect(failures.map(([name]: [string, boolean]) => name)).toEqual([
    '5-minute provider access token',
    '60-minute provider refresh token',
    'no password auth grant',
  ]);
  expect(
    configurationChecks(undefined, undefined).some(([, passed]: [string, boolean]) => !passed),
  ).toBe(true);
});
