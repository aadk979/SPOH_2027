import { describe, expect, it } from 'vitest';
import { assertMaySend, pushPreview } from '../../src/modules/announcement/domain/sendRules.js';

/** Announcement rules (P06.8), without a database. */

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe('announcement rules', () => {
  it('lets only a Deputy Coordinator and above address the whole event', () => {
    expect(codeOf(() => assertMaySend({ role: 'IC' }, null))).toBe('FORBIDDEN');
    expect(codeOf(() => assertMaySend({ role: 'DEPUTY_COORDINATOR' }, null))).toBeUndefined();
    expect(codeOf(() => assertMaySend({ role: 'IC' }, 'station'))).toBeUndefined();
  });

  it('truncates a push preview to 140 characters', () => {
    expect(pushPreview('short')).toBe('short');
    const preview = pushPreview('x'.repeat(200));
    expect(preview).toHaveLength(140);
    expect(preview.endsWith('...')).toBe(true);
  });
});
