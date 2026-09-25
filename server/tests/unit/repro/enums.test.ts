import { readFileSync } from 'node:fs';
import * as shared from '@spoh/shared';
import { describe, expect, it } from 'vitest';

/**
 * P03 bug reproduction: `packages/shared/src/enums.ts` says every Prisma enum
 * is mirrored there, and one is not (P01.3). Skipped until fixed (P07.8);
 * asserts the rule and fails today.
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
  it.skip('mirrors every Prisma enum in @spoh/shared with the same members', () => {
    const exported = shared as unknown as Record<string, { options?: readonly string[] }>;
    const mismatches = prismaEnums
      .filter(
        ({ name, members }) => JSON.stringify(exported[name]?.options) !== JSON.stringify(members),
      )
      .map(({ name }) => name);

    expect(mismatches).toEqual([]);
  });
});
