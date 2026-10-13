import { describe, expect, it } from 'vitest';
import { restoredOperatorConfiguration } from '../../prisma/restoredOperatorInputs.js';

const source = { NODE_ENV: 'production', SEED_BOOTSTRAP_MODE: 'restored-operator', SPOH_SKIP_DOTENV: '1',
  DATABASE_URL: 'postgresql://spoh:spoh@localhost:5435/spoh2027_test',
  SEED_ADMIN_ORGANISATION_ID: 'synthetic-org', SEED_ADMIN_EMAIL: 'operator@example.test',
  SEED_ADMIN_NAME: 'Reviewed Operator', SEED_ADMIN_SUB: '11111111-1111-4111-8111-111111111111',
  COGNITO_USER_POOL_ID: 'ap-southeast-1_synthetic', COGNITO_REGION: 'ap-southeast-1',
  SEED_BOOTSTRAP_OWNER_APPROVAL_REFERENCE: 'synthetic-reviewed-restore',
  SEED_RECOVERY_OPERATOR_PERSON_ID: 'retained-person',
  SEED_RECOVERY_OPERATOR_EXPECTED_SUBJECT: '22222222-2222-4222-8222-222222222222',
  SEED_RECOVERY_OPERATOR_OPERATION_ID: '33333333-3333-4333-8333-333333333333', SEED_RECOVERY_OPERATOR_REASON: 'Reviewed synthetic restore' };
describe('the explicit restored-operator configuration', () => {
  it('retains the exact existing person, old subject and reviewed operation', () => {
    expect(restoredOperatorConfiguration(source)).toMatchObject({ personId: 'retained-person',
      expectedSubject: source.SEED_RECOVERY_OPERATOR_EXPECTED_SUBJECT, operationId: source.SEED_RECOVERY_OPERATOR_OPERATION_ID });
  });
  it.each(Object.keys(source))('requires explicit %s', (key) => {
    expect(() => restoredOperatorConfiguration({ ...source, [key]: '' })).toThrow(/requires|invalid/);
  });
  it.each([{ NODE_ENV: 'test' }, { SEED_BOOTSTRAP_MODE: 'initial' },
    { SEED_RECOVERY_OPERATOR_EXPECTED_SUBJECT: 'local:unverified' }, { SEED_RECOVERY_OPERATOR_OPERATION_ID: 'unreviewed' },
    { SEED_RECOVERY_OPERATOR_REASON: 'x'.repeat(513) }, { SEED_RECOVERY_OPERATOR_PERSON_ID: ' '.repeat(10) }])(
    'refuses invalid or implicit mode %j', (overrides) => {
      expect(() => restoredOperatorConfiguration({ ...source, ...overrides })).toThrow(/requires|invalid/);
    });
});
