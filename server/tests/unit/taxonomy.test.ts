import { readFileSync } from 'node:fs';
import * as shared from '@spoh/shared';
import { describe, expect, it } from 'vitest';

/**
 * The no-taxonomy test (ADR-002 §2, P09.10). What an organiser chooses is
 * the event's data: its capture categories, station types and tags, and shift
 * templates. The enums that once held SPOH 2027's choices must not return,
 * in the schema or as a `z.enum` in the shared package.
 */

const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');

const RETIRED = ['VisitorCategory', 'StationKind', 'CourseCode', 'ShiftBlock'];

/** Members only those enums had: a z.enum listing one is a taxonomy compiled in. */
const RETIRED_MEMBERS = [
  'SEC_1',
  'GRADUATED_AWAITING_RESULTS',
  'PARENT_GUARDIAN',
  'SIGNUP_BOOTH',
  'WELCOME_LOUNGE',
  'COURSE_STATION',
  'MISSION_COMPLETE',
  'WELCOME_PARTY',
  'DAAA',
  'DCDF',
  'DCS',
  'DCITP',
  'MORNING',
  'AFTERNOON',
];

describe('no event taxonomy enums (ADR-002 §2)', () => {
  it.each(RETIRED)('the schema declares no %s enum', (name) => {
    expect(schema).not.toMatch(new RegExp(`^enum ${name} \\{`, 'm'));
  });

  it("no z.enum in @spoh/shared lists the retired enums' members", () => {
    const offenders = Object.entries(shared as Record<string, unknown>)
      .filter(([, value]) => Array.isArray((value as { options?: unknown }).options))
      .filter(([, value]) =>
        (value as { options: unknown[] }).options.some((member) =>
          RETIRED_MEMBERS.includes(String(member)),
        ),
      )
      .map(([name]) => name);

    expect(offenders).toEqual([]);
  });
});
