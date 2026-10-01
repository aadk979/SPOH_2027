import { readFileSync } from 'node:fs';
import * as shared from '@spoh/shared';
import { describe, expect, it } from 'vitest';

/**
 * P03 bug reproduction (F03-038), the mirror test ADR-002 §2 keeps: every
 * Prisma enum is mirrored in `@spoh/shared` with the same members, and the
 * invariant enums module declares nothing else. Fixed in P09.10 by mirroring
 * AttendanceMethod.
 */

const schema = readFileSync(new URL('../../../prisma/schema.prisma', import.meta.url), 'utf8');
const prismaEnums = [...schema.matchAll(/^enum (\w+) \{([^}]*)\}/gm)].map(([, name, body]) => ({
  name: name as string,
  members: (body as string)
    .split('\n')
    .map((line) => line.replace(/\/\/.*/, '').trim())
    .filter((line) => /^[A-Z_0-9]+$/.test(line)),
}));

describe('shared enums (P03 repros)', () => {
  // F03-038
  it('mirrors every Prisma enum in @spoh/shared with the same members', () => {
    const exported = shared as unknown as Record<string, { options?: readonly string[] }>;
    const mismatches = prismaEnums
      .filter(
        ({ name, members }) => JSON.stringify(exported[name]?.options) !== JSON.stringify(members),
      )
      .map(({ name }) => name);

    expect(mismatches).toEqual([]);
  });

  it('declares no invariant enum the schema does not have', () => {
    const invariants = readFileSync(
      new URL('../../../../packages/shared/src/invariants/enums.ts', import.meta.url),
      'utf8',
    );
    const declared = [...invariants.matchAll(/^export const (\w+) = z\.enum\(/gm)].map(
      ([, name]) => name as string,
    );
    const inSchema = new Set(prismaEnums.map(({ name }) => name));

    expect(declared.filter((name) => !inSchema.has(name))).toEqual([]);
  });
});
