import { fileURLToPath } from 'node:url';
import {
  AdminInitiateAuthCommand,
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
  ListGroupsCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/**
 * Verify a deployed environment's Cognito setup and auth path.
 *
 * Run this against staging before each dry run, and against production before
 * 6 January. It checks the configuration that is easy to get wrong in a console
 * and then proves a real token actually works end to end — configuration that
 * looks right and an auth path that works are different claims.
 *
 *   AWS_PROFILE=... node scripts/verify-cognito.mjs
 *   node scripts/verify-cognito.mjs --api https://staging-api.example
 *
 * The live-token checks need a test account and its password. Without
 * `VERIFY_EMAIL` and `VERIFY_PASSWORD` the script still runs every
 * configuration check and skips the rest.
 */

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function loadEnv() {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch {
    // Falling back to the ambient environment.
  }
}

loadEnv();

const POOL_ID = arg('pool') ?? process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = arg('client') ?? process.env.COGNITO_CLIENT_ID;
const REGION = arg('region') ?? process.env.COGNITO_REGION ?? 'ap-southeast-1';
const API = arg('api') ?? process.env.VERIFY_API ?? 'http://localhost:4010';

const TEST_EMAIL = process.env.VERIFY_EMAIL;
const TEST_PASSWORD = process.env.VERIFY_PASSWORD;

if (!POOL_ID || !CLIENT_ID) {
  throw new Error('COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set (or passed as flags).');
}

const cognito = new CognitoIdentityProviderClient({ region: REGION });

const results = [];

function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** BUILD_PLAN §6.1 and docs/DEPLOYMENT.md §3. */
async function checkPoolConfiguration() {
  console.log(`\nuser pool ${POOL_ID} (${REGION})`);

  const { UserPool: pool } = await cognito.send(
    new DescribeUserPoolCommand({ UserPoolId: POOL_ID }),
  );

  // The single most important setting. Self sign-up would let anyone outside
  // the roster create an account against the event.
  check(
    'self sign-up is disabled',
    pool?.AdminCreateUserConfig?.AllowAdminCreateUserOnly === true,
    pool?.AdminCreateUserConfig?.AllowAdminCreateUserOnly ? undefined : 'ANYONE CAN SIGN UP',
  );

  check(
    'password policy is at least 12 characters',
    (pool?.Policies?.PasswordPolicy?.MinimumLength ?? 0) >= 12,
    `min ${pool?.Policies?.PasswordPolicy?.MinimumLength ?? '?'}`,
  );

  check(
    'sign-in is by email',
    (pool?.UsernameAttributes ?? []).includes('email'),
    (pool?.UsernameAttributes ?? []).join(', ') || 'none',
  );
}

async function checkGroups() {
  console.log('\ngroups');

  const { Groups: groups } = await cognito.send(new ListGroupsCommand({ UserPoolId: POOL_ID }));
  const byName = new Map((groups ?? []).map((group) => [group.GroupName, group.Precedence]));

  const expected = [
    ['Admin', 0],
    ['Lead', 10],
    ['ChiefCoordinator', 20],
    ['DeputyCoordinator', 30],
    ['IC', 40],
    ['Volunteer', 50],
  ];

  for (const [name, precedence] of expected) {
    check(
      `${name} exists at precedence ${precedence}`,
      byName.get(name) === precedence,
      byName.has(name) ? `found ${byName.get(name)}` : 'missing',
    );
  }
}

async function checkClient() {
  console.log(`\napp client ${CLIENT_ID}`);

  const { UserPoolClient: client } = await cognito.send(
    new DescribeUserPoolClientCommand({ UserPoolId: POOL_ID, ClientId: CLIENT_ID }),
  );

  // A public SPA cannot keep a secret. One here means the client was created
  // with the wrong template and the browser flow will not work.
  check(
    'no client secret',
    !client?.ClientSecret,
    client?.ClientSecret ? 'SECRET PRESENT' : undefined,
  );

  check(
    'access token expires in 60 minutes',
    client?.AccessTokenValidity === 60 && client?.TokenValidityUnits?.AccessToken === 'minutes',
    `${client?.AccessTokenValidity} ${client?.TokenValidityUnits?.AccessToken}`,
  );

  // A shift is 4.5 hours; 12 covers a full day and expires overnight, so a
  // phone lost on the 7th stops working on the 8th.
  check(
    'refresh token expires in 12 hours',
    client?.RefreshTokenValidity === 12 && client?.TokenValidityUnits?.RefreshToken === 'hours',
    `${client?.RefreshTokenValidity} ${client?.TokenValidityUnits?.RefreshToken}`,
  );
}

/**
 * Configuration that looks right and an auth path that works are different
 * claims. This proves the second one.
 */
async function checkLiveAuth() {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    console.log('\nlive auth — skipped (set VERIFY_EMAIL and VERIFY_PASSWORD)');
    return;
  }

  console.log(`\nlive auth against ${API}`);

  /**
   * Establish which auth provider the API is running before anything else,
   * because it explains every failure that follows.
   *
   * Pointing this at a local development server is the likeliest mistake, and
   * "the token was rejected" is a confusing way to discover it at 8am before a
   * dry run.
   */
  const devAuthProbe = await fetch(`${API}/api/v1/dev-auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL }),
  });

  const apiRunsCognito = devAuthProbe.status === 404;

  check(
    'the development sign-in route is not mounted',
    apiRunsCognito,
    apiRunsCognito
      ? undefined
      : `got ${devAuthProbe.status} — this API is running AUTH_PROVIDER=local`,
  );

  if (!apiRunsCognito) {
    console.log('');
    console.log(`  ${API} is running the development auth provider, so it cannot`);
    console.log('  verify a Cognito token. The pool configuration above is still valid.');
    console.log('  Set AUTH_PROVIDER=cognito on that server, or pass --api pointing at a');
    console.log('  deployed environment.');
    return;
  }

  const auth = await cognito.send(
    new AdminInitiateAuthCommand({
      UserPoolId: POOL_ID,
      ClientId: CLIENT_ID,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: TEST_EMAIL, PASSWORD: TEST_PASSWORD },
    }),
  );

  const token = auth.AuthenticationResult?.AccessToken;
  check('a real token can be obtained', Boolean(token));
  if (!token) return;

  const me = await fetch(`${API}/api/v1/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await me.json().catch(() => null);

  check(
    'the API accepts the token and resolves the roster row',
    me.status === 200,
    me.status === 200
      ? `${body?.volunteer?.displayName} (${body?.volunteer?.role})`
      : `${me.status} ${body?.error?.code ?? ''}`,
  );

  const forged = await fetch(`${API}/api/v1/me`, {
    headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.x' },
  });
  check('a forged token is rejected', forged.status === 401, `got ${forged.status}`);

  const anonymous = await fetch(`${API}/api/v1/me`);
  check(
    'an unauthenticated request is rejected',
    anonymous.status === 401,
    `got ${anonymous.status}`,
  );
}

await checkPoolConfiguration();
await checkGroups();
await checkClient();
await checkLiveAuth();

const failed = results.filter((result) => !result.passed);

console.log('');
console.log(`${results.length - failed.length}/${results.length} checks passed`);
console.log(failed.length === 0 ? 'PASS' : 'FAIL');

process.exitCode = failed.length === 0 ? 0 : 1;
