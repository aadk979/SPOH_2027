import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RecoveryPlan, isRecentPlan } from '../../src/modules/identityRecovery/domain/plan.js';

const NOW = new Date('2027-01-07T03:30:00Z');
const valid = () => ({ version: 1, planId: randomUUID(), plannedAt: NOW.toISOString(),
  organisationId: 'org', targetPoolId: 'ap-southeast-1_recovery', items: [{ personId: 'person',
    profileDigest: 'a'.repeat(64), expectedSubjectDigest: 'b'.repeat(64) }] });

describe('reviewed recovery plan', () => {
  it('accepts bounded fingerprints and refuses arbitrary personal fields or duplicate people', () => {
    const plan = valid();
    expect(RecoveryPlan.parse(plan)).toEqual(plan);
    expect(RecoveryPlan.safeParse({ ...plan, email: 'private@example.test' }).success).toBe(false);
    expect(RecoveryPlan.safeParse({ ...plan, items: [{ ...plan.items[0], cognitoSub: 'private-subject' }] }).success).toBe(false);
    expect(RecoveryPlan.safeParse({ ...plan, items: [...plan.items, ...plan.items] }).success).toBe(false);
  });
  it.each([{ version: 2 }, { planId: 'wrong' }, { targetPoolId: 'local' }, { plannedAt: 'invalid' },
    { items: [{ personId: '', profileDigest: 'wrong', expectedSubjectDigest: 'wrong' }] }])(
    'refuses malformed planning metadata %j', (change) => {
      expect(RecoveryPlan.safeParse({ ...valid(), ...change }).success).toBe(false);
    });
  it('bounds the reviewed plan age at seven days and refuses a future plan', () => {
    const plan = RecoveryPlan.parse(valid());
    expect(isRecentPlan(plan, NOW)).toBe(true);
    expect(isRecentPlan(plan, new Date(NOW.getTime() + 7 * 86400_000))).toBe(true);
    expect(isRecentPlan(plan, new Date(NOW.getTime() + 7 * 86400_000 + 1))).toBe(false);
    expect(isRecentPlan(plan, new Date(NOW.getTime() - 1))).toBe(false);
  });
});
