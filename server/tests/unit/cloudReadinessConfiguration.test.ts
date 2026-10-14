import { expect, it } from 'vitest';
import { parseEnv } from '../../src/config/schema.js';

const base = { DATABASE_URL: 'postgresql://spoh:spoh@localhost:5435/spoh2027_test',
  AUTH_PROVIDER: 'local', LOCAL_AUTH_SECRET: 'test-only-secret-at-least-thirty-two-chars' };
const config = { region: 'ap-southeast-1', account: '123456789012',
  nativeOrigin: 'https://owned123.execute-api.ap-southeast-1.amazonaws.com', deploymentId: 'a'.repeat(40),
  databaseIdentifier: 'owned-database', databaseId: 'arn:aws:rds:ap-southeast-1:123456789012:db:owned-database',
  requiredAlarmIds: ['arn:aws:cloudwatch:ap-southeast-1:123456789012:alarm:spoh-staging-running-tasks'],
  freshness: { smokeMaxAgeMs: 300_000, backupMaxAgeMs: 300_000, alarmsMaxAgeMs: 300_000 } };
it('leaves unconfigured local infrastructure absent, while parsing the selected complete task configuration', () => {
  expect(parseEnv(base).READINESS_CLOUD_CONFIG).toBeUndefined();
  expect(parseEnv({ ...base, READINESS_CLOUD_CONFIG: '' }).READINESS_CLOUD_CONFIG).toBeUndefined();
  expect(parseEnv({ ...base, READINESS_CLOUD_CONFIG: JSON.stringify(config) }).READINESS_CLOUD_CONFIG).toEqual(config);
});
it.each(['not-json', '[]', '{}', JSON.stringify({ ...config, deploymentId: 'mutable' }),
  JSON.stringify({ ...config, unexpectedOwnerEmail: 'private-value' })])('refuses partial or malformed boot selection without reflecting it: %s', raw => {
  expect(() => parseEnv({ ...base, READINESS_CLOUD_CONFIG: raw })).toThrow('READINESS_CLOUD_CONFIG');
  try { parseEnv({ ...base, READINESS_CLOUD_CONFIG: raw }); } catch (error) {
    expect(String(error)).not.toContain('private-value');
  }
});
