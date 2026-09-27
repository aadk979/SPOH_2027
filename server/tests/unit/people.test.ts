import { describe, expect, it } from 'vitest';
import {
  assertActive,
  assertMayActOn,
  assertMayGrant,
  assertNoReportingCycle,
  outranks,
} from '../../src/modules/people/domain/escalation.js';

/** The people guardrails (P06.4): pure, so tested without a database. */

const chief = { volunteerId: 'chief', role: 'CHIEF_COORDINATOR' } as const;
const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe('escalation', () => {
  it('ranks roles', () => {
    expect(outranks('ADMIN', 'CHIEF_COORDINATOR')).toBe(true);
    expect(outranks('CHIEF_COORDINATOR', 'CHIEF_COORDINATOR')).toBe(false);
  });

  it.each([
    [{ id: 'chief', role: 'VOLUNTEER' as const }, 'SELF_MUTATION_DENIED'],
    [{ id: 'x', role: 'CHIEF_COORDINATOR' as const }, 'ROLE_ESCALATION_DENIED'],
    [{ id: 'x', role: 'ADMIN' as const }, 'ROLE_ESCALATION_DENIED'],
    [{ id: 'x', role: 'IC' as const }, undefined],
  ])('a Chief acting on %o → %s', (target, code) => {
    expect(codeOf(() => assertMayActOn(chief, target, 'edit'))).toBe(code);
  });

  it('grants only roles below the actor', () => {
    expect(codeOf(() => assertMayGrant('CHIEF_COORDINATOR', 'ADMIN'))).toBe(
      'ROLE_ESCALATION_DENIED',
    );
    expect(codeOf(() => assertMayGrant('CHIEF_COORDINATOR', 'IC'))).toBeUndefined();
    expect(codeOf(() => assertMayGrant('CHIEF_COORDINATOR', undefined))).toBeUndefined();
  });

  it('refuses a deactivation of someone already inactive, and the reverse', () => {
    expect(codeOf(() => assertActive({ active: false }, true))).toBe('CONFLICT');
    expect(codeOf(() => assertActive({ active: true }, false))).toBe('CONFLICT');
  });
});

describe('assertNoReportingCycle', () => {
  const chain: Record<string, string | null> = { b: 'c', c: 'a', d: null };
  const managerOf = async (id: string) => chain[id] ?? null;

  it('refuses reporting to oneself and a loop back to the person', async () => {
    await expect(
      assertNoReportingCycle({ volunteerId: 'a', managerId: 'a' }, managerOf),
    ).rejects.toMatchObject({
      code: 'REPORTING_CYCLE',
    });
    await expect(
      assertNoReportingCycle({ volunteerId: 'a', managerId: 'b' }, managerOf),
    ).rejects.toMatchObject({
      code: 'REPORTING_CYCLE',
    });
  });

  it('accepts a chain that ends', async () => {
    await expect(
      assertNoReportingCycle({ volunteerId: 'a', managerId: 'd' }, managerOf),
    ).resolves.toBeUndefined();
  });
});
