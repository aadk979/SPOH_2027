import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyLocalLoadEnvironment, localBrowserFixtureEnvironment, localBrowserMockEnvironment } from './browser-test-environment.mjs';

const url = 'postgresql://spoh:spoh@localhost:5435/spoh2027_test';
const base = { NODE_ENV: 'development', DEPLOYMENT_ENV: 'development', AUTH_PROVIDER: 'local', SPOH_SKIP_DOTENV: '1',
  DATABASE_URL: url, TEST_DATABASE_URL: url, E2E_DATABASE_URL: url,
  E2E_BASE_URL: 'http://localhost:4012', E2E_API_ORIGIN: 'http://localhost:4012',
  VISUAL_BASE_URL: 'http://localhost:4012', VISUAL_API_URL: 'http://localhost:4012' };

test('the real local static fixture uses one declared database and one explicit origin', () => {
  assert.deepEqual(localBrowserFixtureEnvironment(base), { baseURL: base.E2E_BASE_URL, apiOrigin: base.E2E_API_ORIGIN, databaseUrl: url });
  assert.equal(localBrowserFixtureEnvironment(base, 'visual').baseURL, base.VISUAL_BASE_URL);
  const ciUrl = url.replace(':5435/', ':5432/');
  assert.equal(localBrowserFixtureEnvironment({ ...base, CI: '1', DATABASE_URL: ciUrl, TEST_DATABASE_URL: ciUrl, E2E_DATABASE_URL: ciUrl }).databaseUrl, ciUrl);
});

for (const [label, change] of [
  ['staging deployment', { DEPLOYMENT_ENV: 'staging' }],
  ['production mode', { NODE_ENV: 'production' }],
  ['provider backed auth', { AUTH_PROVIDER: 'cognito' }],
  ['missing database', { E2E_DATABASE_URL: undefined }],
  ['different browser database', { E2E_DATABASE_URL: url.replace('spoh2027_test', 'spoh2027_visual_test') }],
  ['missing primary database', { DATABASE_URL: undefined }],
  ['remote origin', { E2E_BASE_URL: 'https://staging.example.invalid' }],
  ['old client port', { E2E_BASE_URL: 'http://localhost:3001' }],
  ['old API port', { E2E_API_ORIGIN: 'http://localhost:4014' }],
  ['userinfo URL', { E2E_BASE_URL: 'http://name:password@localhost:4012' }],
  ['origin path', { E2E_BASE_URL: 'http://localhost:4012/private' }],
]) test(`local SQL/sign-in fixtures refuse ${label}`, () => assert.throws(() => localBrowserFixtureEnvironment({ ...base, ...change })));

test('mock composition cannot target remote hosting and carries no provider evidence', () => {
  assert.match(localBrowserMockEnvironment(base).evidence, /mocked local UI/);
  assert.throws(() => localBrowserMockEnvironment({ ...base, E2E_BASE_URL: 'https://staging.example.invalid' }));
  assert.throws(() => localBrowserMockEnvironment({ ...base, DEPLOYMENT_ENV: 'staging' }));
});

test('legacy load cannot read dotenv or mint synthetic credentials against a remote deployment', () => {
  const source = { ...base, LOCAL_AUTH_SECRET: 'test-only-secret-with-at-least-thirty-two-chars', LOAD_TEST_API: base.E2E_API_ORIGIN };
  assert.match(legacyLocalLoadEnvironment(source).evidence, /not staging acceptance/);
  for (const change of [{ LOAD_TEST_API: 'https://staging.example.invalid' }, { DEPLOYMENT_ENV: 'staging' },
    { AUTH_PROVIDER: 'cognito' }, { LOCAL_AUTH_SECRET: undefined }, { SPOH_SKIP_DOTENV: undefined }])
    assert.throws(() => legacyLocalLoadEnvironment({ ...source, ...change }));
});
