import { describe, expect, it } from 'vitest';
import { assertNotWorked } from '../../src/modules/assignments/domain/assignmentRules.js';
import { assertMayReadRoster } from '../../src/modules/assignments/domain/rosterVisibility.js';

/** Assignment rules (P06.4, F04-004). */

describe('assertMayReadRoster', () => {
  it.each([
    ['IC', true, true],
    ['IC', false, false],
    ['DEPUTY_COORDINATOR', false, true],
    ['CHIEF_COORDINATOR', false, true],
  ] as const)('%s rostered there %s → allowed %s', (role, rosteredThere, allowed) => {
    const run = (): void => assertMayReadRoster({ role }, rosteredThere);
    if (allowed) expect(run).not.toThrow();
    else expect(run).toThrow(expect.objectContaining({ statusCode: 403 }));
  });
});

describe('assertNotWorked', () => {
  it('refuses to delete a shift someone checked in to', () => {
    expect(() => assertNotWorked({ checkedInAt: null })).not.toThrow();
    expect(() => assertNotWorked({ checkedInAt: new Date() })).toThrow(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
  });
});
