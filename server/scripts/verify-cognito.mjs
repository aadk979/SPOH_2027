import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SessionResponse } from '@spoh/shared';

/** Read-only configuration checks. Optional live probes exchange a short-lived synthetic
 * provider token; they never enable password grants, create accounts or inspect groups.
 * Run in P16 after AWS recreation. VERIFY_PROVIDER_ACCESS_TOKEN is secret input only. */
export function configurationChecks(pool, client) {
  const password = pool?.Policies?.PasswordPolicy ?? {};
  const unit = client?.TokenValidityUnits ?? {};
  return [
    ['self sign-up disabled', pool?.AdminCreateUserConfig?.AllowAdminCreateUserOnly === true],
    ['email sign-in', (pool?.UsernameAttributes ?? []).includes('email')],
    [
      'password minimum 12 with all character classes',
      password.MinimumLength >= 12 &&
        password.RequireLowercase &&
        password.RequireUppercase &&
        password.RequireNumbers &&
        password.RequireSymbols,
    ],
    ['temporary passwords expire within 30 days', password.TemporaryPasswordValidityDays <= 30],
    [
      'optional TOTP without SMS',
      pool?.MfaConfiguration === 'OPTIONAL' &&
        (pool?.EnabledMfas ?? []).includes('SOFTWARE_TOKEN_MFA') &&
        !(pool?.EnabledMfas ?? []).includes('SMS_MFA'),
    ],
    [
      'Cognito default sender per D-08',
      !pool?.EmailConfiguration?.EmailSendingAccount ||
        pool.EmailConfiguration.EmailSendingAccount === 'COGNITO_DEFAULT',
    ],
    ['public app client without secret', Boolean(client) && !client.ClientSecret],
    [
      '5-minute provider access token',
      client?.AccessTokenValidity === 5 && unit.AccessToken === 'minutes',
    ],
    ['5-minute provider ID token', client?.IdTokenValidity === 5 && unit.IdToken === 'minutes'],
    [
      '60-minute provider refresh token',
      client?.RefreshTokenValidity === 60 && unit.RefreshToken === 'minutes',
    ],
    [
      'only OAuth code grant',
      client?.AllowedOAuthFlowsUserPoolClient === true &&
        client?.AllowedOAuthFlows?.join(',') === 'code',
    ],
    [
      'no password auth grant',
      !(client?.ExplicitAuthFlows ?? []).some((flow) => flow.includes('PASSWORD')),
    ],
    [
      'revocation and existence protection',
      client?.EnableTokenRevocation === true && client?.PreventUserExistenceErrors === 'ENABLED',
    ],
    [
      'MFA enrollment scope',
      (client?.AllowedOAuthScopes ?? []).includes('aws.cognito.signin.user.admin'),
    ],
  ];
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function checkLiveAuth(api, token, check) {
  const config = await fetch(`${api}/api/v1/client-config`);
  const data = await config.json().catch(() => null);
  check('API uses Cognito', config.ok && data?.data?.authProvider === 'cognito');
  for (const bearer of [undefined, 'synthetic-invalid-proof', token]) {
    const response = await fetch(`${api}/api/v1/events`, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    });
    check(
      bearer === token
        ? 'provider bearer cannot bypass app sessions'
        : 'anonymous/forged access refused',
      response.status === 401,
    );
  }
  const response = await fetch(`${api}/api/v1/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerAccessToken: token }),
  });
  const parsed = SessionResponse.safeParse(await response.json().catch(() => null));
  check(
    'synthetic provider credential opens a thin app session',
    response.status === 201 && parsed.success,
  );
  if (!parsed.success) return;
  const session = parsed.data;
  const cookie = response.headers.get('set-cookie') ?? '';
  check(
    'refresh cookie is secure, httpOnly and auth-scoped',
    /HttpOnly/i.test(cookie) &&
      /Secure/i.test(cookie) &&
      /Path=\/api\/v1\/auth(?:;|$)/i.test(cookie),
  );
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  try {
    const devices = await fetch(`${api}/api/v1/auth/sessions`, { headers });
    check(
      session.mfaRequired
        ? 'MFA-restricted session cannot read devices'
        : 'thin session resolves owned devices',
      session.mfaRequired ? devices.status === 401 : devices.status === 200,
    );
    if (session.mfaRequired)
      console.log('  DEFERRED full TOTP and browser handoff exercise: P16.8');
  } finally {
    const logout = await fetch(`${api}/api/v1/auth/session`, { method: 'DELETE', headers });
    check('synthetic session revoked after probe', logout.ok);
  }
}

export async function main() {
  if (process.env.SPOH_SKIP_DOTENV !== '1') {
    try {
      process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
    } catch {
      /* Ambient config. */
    }
  }
  const poolId = arg('pool') ?? process.env.COGNITO_USER_POOL_ID;
  const clientId = arg('client') ?? process.env.COGNITO_CLIENT_ID;
  if (!poolId || !clientId)
    throw new Error('Pass --pool and --client or their COGNITO environment values.');
  const cognito = new CognitoIdentityProviderClient({
    region: arg('region') ?? process.env.COGNITO_REGION ?? 'ap-southeast-1',
  });
  const [pool, client] = await Promise.all([
    cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId })),
    cognito.send(new DescribeUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId })),
  ]);
  const results = [];
  const check = (name, passed) => {
    results.push(Boolean(passed));
    console.log(`  ${passed ? 'PASS' : 'FAIL'} ${name}`);
  };
  configurationChecks(pool.UserPool, client.UserPoolClient).forEach(([name, passed]) =>
    check(name, passed),
  );
  const token = process.env.VERIFY_PROVIDER_ACCESS_TOKEN;
  if (token)
    await checkLiveAuth(
      (arg('api') ?? process.env.VERIFY_API ?? 'http://localhost:4010').replace(/\/$/, ''),
      token,
      check,
    );
  else
    console.log(
      '  DEFERRED live auth: supply a synthetic short-lived VERIFY_PROVIDER_ACCESS_TOKEN during P16.8',
    );
  console.log(`${results.filter(Boolean).length}/${results.length} executed checks passed`);
  return results.every(Boolean) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      console.error(
        'Cognito verification could not complete. Check private configuration and connectivity.',
      );
      process.exitCode = 1;
    },
  );
}
