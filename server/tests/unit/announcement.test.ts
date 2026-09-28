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
    const ic = { role: 'IC' as const, todaysStationIds: ['booth'] };
    const deputy = { role: 'DEPUTY_COORDINATOR' as const, todaysStationIds: [] };
    expect(codeOf(() => assertMaySend(ic, null))).toBe('FORBIDDEN');
    expect(codeOf(() => assertMaySend(deputy, null))).toBeUndefined();
  });

  it('lets an IC address only a station they are rostered at today (F04-024)', () => {
    const ic = { role: 'IC' as const, todaysStationIds: ['booth'] };
    expect(codeOf(() => assertMaySend(ic, 'booth'))).toBeUndefined();
    expect(codeOf(() => assertMaySend(ic, 'desk'))).toBe('FORBIDDEN');
    const deputy = { role: 'DEPUTY_COORDINATOR' as const, todaysStationIds: [] };
    expect(codeOf(() => assertMaySend(deputy, 'desk'))).toBeUndefined();
  });

  it('truncates a push preview to 140 characters', () => {
    expect(pushPreview('short')).toBe('short');
    const preview = pushPreview('x'.repeat(200));
    expect(preview).toHaveLength(140);
    expect(preview.endsWith('...')).toBe(true);
  });
});
