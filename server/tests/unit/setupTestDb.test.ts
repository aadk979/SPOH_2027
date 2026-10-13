import { describe, expect, it } from 'vitest';
// @ts-expect-error -- Import-safe JavaScript CLI guard is exercised without database or process effects.
import { testDatabaseEnvironment } from '../../scripts/setup-test-db.mjs';

const url = 'postgresql://spoh:spoh@localhost:5435/spoh2027_test';
const base = { NODE_ENV: 'test', SPOH_SKIP_DOTENV: '1', TEST_DATABASE_URL: url, DATABASE_URL: url };
describe('sole test database migration guard', () => {
  it('accepts the exact explicit local test database without loading dotenv or provisioning databases', () => {
    expect(testDatabaseEnvironment(base)).toEqual(base);
  });
  it.each([
    { NODE_ENV: 'production' }, { SPOH_SKIP_DOTENV: '0' }, { TEST_DATABASE_URL: undefined },
    { TEST_DATABASE_URL: url.replace('spoh2027_test', 'inventory_test') },
    { TEST_DATABASE_URL: url.replace('spoh2027_test', 'spoh2027') },
    { TEST_DATABASE_URL: url.replace('localhost', 'remote.invalid') },
    { TEST_DATABASE_URL: url.replace('5435', '5432') }, { DATABASE_URL: url.replace('spoh2027_test', 'spoh2027') },
    { TEST_DATABASE_URL: `${url}/extra` }, { TEST_DATABASE_URL: url.replace('postgresql:', 'https:') },
  ])('refuses unsafe configuration %j before any effects', (overrides) => {
    expect(() => testDatabaseEnvironment({ ...base, ...overrides })).toThrow();
  });
  it('allows only the explicit GitHub CI test service on 5432', () => {
    const ciUrl = url.replace('5435', '5432');
    expect(testDatabaseEnvironment({ ...base, CI: 'true', DATABASE_URL: ciUrl, TEST_DATABASE_URL: ciUrl })).toMatchObject({ DATABASE_URL: ciUrl });
  });
});
