import assert from 'node:assert/strict';
import test from 'node:test';
import { testDatabaseEnvironment } from './test-database-environment.mjs';

const url = 'postgresql://spoh:spoh@localhost:5435/spoh2027_test';
const base = { NODE_ENV: 'test', SPOH_SKIP_DOTENV: '1', DATABASE_URL: url, TEST_DATABASE_URL: url };

test('the sole explicit local test URL is retained; CI accepts only its declared test port', () => {
  assert.deepEqual(testDatabaseEnvironment(base), base);
  const ciUrl = url.replace(':5435/', ':5432/');
  for (const CI of ['true', '1']) assert.equal(testDatabaseEnvironment({ ...base, CI, DATABASE_URL: ciUrl, TEST_DATABASE_URL: ciUrl }).DATABASE_URL, ciUrl);
});

for (const [label, change] of [
  ['production', { NODE_ENV: 'production' }],
  ['implicit dotenv', { SPOH_SKIP_DOTENV: undefined }],
  ['missing test URL', { TEST_DATABASE_URL: undefined }],
  ['different database', { TEST_DATABASE_URL: url.replace('spoh2027_test', 'inventory_test') }],
  ['real database', { TEST_DATABASE_URL: url.replace('spoh2027_test', 'spoh2027') }],
  ['remote host', { TEST_DATABASE_URL: url.replace('localhost', 'db.example.invalid') }],
  ['host override query', { TEST_DATABASE_URL: `${url}?host=db.example.invalid` }],
  ['schema override query', { TEST_DATABASE_URL: `${url}?schema=retained` }],
  ['fragment', { TEST_DATABASE_URL: `${url}#ignored` }],
  ['wrong local port', { TEST_DATABASE_URL: url.replace(':5435/', ':5432/') }],
  ['mismatched URLs', { DATABASE_URL: url.replace('localhost', '127.0.0.1') }],
]) test(`refuses ${label} before any driver or migration is imported`, () => assert.throws(() => testDatabaseEnvironment({ ...base, ...change })));
