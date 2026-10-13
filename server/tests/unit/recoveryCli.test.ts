import { describe, expect, it } from 'vitest';
// @ts-expect-error -- The import-safe operator entry point is JavaScript, exercised without loading application configuration.
import { parseRecoveryArguments } from '../../scripts/recover-identities.mjs';
// @ts-expect-error -- Retired compatibility entry point must have the same safe parser and no import-time I/O.
import { parseRecoveryArguments as legacyParser } from '../../scripts/sync-cognito-subs.mjs';

const base = ['--database-env', 'SPOH_RECOVERY_DATABASE_URL', '--operator-token-env',
  'SPOH_RECOVERY_OPERATOR_TOKEN', '--organisation', 'org', '--pool', 'ap-southeast-1_recovery'];
const apply = ['--apply', '--plan', 'reviewed.json', '--reason', 'Synthetic rehearsal',
  '--owner-approval-reference', 'test-reference'];

describe('default-dry-run recovery command', () => {
  it('requires explicit dedicated database and authenticated operator evidence even for a plan', () => {
    expect(() => parseRecoveryArguments([])).toThrow();
    const options = parseRecoveryArguments([...base, '--plan-out', 'reviewed.json']);
    expect(options).not.toHaveProperty('apply');
    expect(options).not.toHaveProperty('invite');
    expect(legacyParser([...base, '--plan-out', 'reviewed.json'])).toEqual(options);
  });
  it.each(['--commit', '--force', '--unknown'])('refuses unsafe legacy or unknown option %s', (flag) => {
    expect(() => parseRecoveryArguments([...base, '--plan-out', 'reviewed.json', flag])).toThrow();
  });
  it('refuses repeated options, missing values and generic environment names', () => {
    expect(() => parseRecoveryArguments([...base, '--pool', 'another'])).toThrow();
    expect(() => parseRecoveryArguments([...base, '--plan-out'])).toThrow();
    expect(() => parseRecoveryArguments(['--database-env', 'DATABASE_URL', ...base.slice(2), '--plan-out', 'x.json'])).toThrow();
  });
  it('requires a concrete reviewed plan and owner reference for apply, separately from invitation', () => {
    expect(parseRecoveryArguments([...base, ...apply])).toMatchObject({ apply: true, plan: 'reviewed.json' });
    expect(() => parseRecoveryArguments([...base, '--apply'])).toThrow();
    expect(() => parseRecoveryArguments([...base, ...apply, '--invite'])).toThrow();
    expect(() => parseRecoveryArguments([...base, ...apply, '--plan-out', 'replacement.json'])).toThrow();
    expect(() => parseRecoveryArguments([...base, '--plan-out', 'reviewed.json', '--resend-key', 'new-id'])).toThrow();
  });
  it('can show help without credentials, database or provider setup', () => {
    expect(parseRecoveryArguments(['--help'])).toEqual({ help: true });
  });
});
