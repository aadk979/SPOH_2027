import { expect, it } from 'vitest';
// @ts-expect-error -- Import the actual operator script, which has no declaration file.
import { configurationChecks, liveProbeOrigins } from '../../scripts/verify-cognito.mjs';
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
  SchemaAttributes: [{ Name: 'custom:spoh_operation', AttributeDataType: 'String', Mutable: false,
    StringAttributeConstraints: { MinLength: '36', MaxLength: '36' } }],
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
  AllowedOAuthScopes: ['openid', 'email', 'aws.cognito.signin.user.admin'],
  ExplicitAuthFlows: [],
  RefreshTokenRotation: { Feature: 'ENABLED', RetryGracePeriodSeconds: 10 },
  ReadAttributes: ['name', 'email', 'email_verified'],
  WriteAttributes: ['name', 'email'],
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
    'explicitly no API auth flows',
  ]);
  expect(
    configurationChecks(undefined, undefined).some(([, passed]: [string, boolean]) => !passed),
  ).toBe(true);
});
it.each([undefined, ['ALLOW_USER_SRP_AUTH'], ['ALLOW_CUSTOM_AUTH'], ['ALLOW_REFRESH_TOKEN_AUTH']])(
  'rejects omitted or implicit API auth flows %j', (flows) => {
    expect(configurationChecks(pool, { ...client, ExplicitAuthFlows: flows }).find(
      ([name]: [string, boolean]) => name === 'explicitly no API auth flows')[1]).toBe(false);
  },
);
it('rejects mutable/exposed creation markers and disabled refresh rotation', () => {
  const checks = configurationChecks({ ...pool, SchemaAttributes: [{ ...pool.SchemaAttributes[0], Mutable: true }] },
    { ...client, ReadAttributes: ['custom:spoh_operation'], RefreshTokenRotation: { Feature: 'DISABLED' } });
  expect(checks.filter(([, passed]: [string, boolean]) => !passed).map(([name]: [string, boolean]) => name)).toEqual([
    'refresh rotation with 10-second retry grace', 'immutable app creation marker', 'app client cannot read or write creation marker',
  ]);
});
it.each([undefined, ['openid', 'email'], [...client.AllowedOAuthScopes, 'profile']])(
  'rejects omitted, incomplete or unnecessary scopes %j', (scopes) => {
    expect(configurationChecks(pool, { ...client, AllowedOAuthScopes: scopes }).find(
      ([name]: [string, boolean]) => name === 'only required OAuth scopes')[1]).toBe(false);
  },
);
it('requires explicit canonical HTTPS probe destinations before sending a synthetic credential', () => {
  expect(liveProbeOrigins('https://api.synthetic.example/', 'https://client.synthetic.example')).toEqual({
    api: 'https://api.synthetic.example', origin: 'https://client.synthetic.example',
  });
  for (const bad of [undefined, 'http://localhost:4010', 'https://user:secret@api.example',
    'https://api.example/path', 'https://api.example?token=secret', 'https://api.example#secret']) {
    expect(() => liveProbeOrigins(bad, 'https://client.example')).toThrow();
    expect(() => liveProbeOrigins('https://api.example', bad)).toThrow();
  }
});
