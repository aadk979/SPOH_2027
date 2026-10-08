import { afterEach, describe, expect, it, vi } from 'vitest';
import { countFinding, countOutcome, drainTally, startShadowSummary } from './shadowTally.js';

describe('the shadow tally', () => {
  afterEach(() => {
    drainTally();
  });

  it('counts each outcome and finding until drained', () => {
    countOutcome('allowed');
    countOutcome('allowed');
    countOutcome('denied');
    countOutcome('unaskable');
    countFinding();
    expect(drainTally()).toEqual({ allowed: 2, denied: 1, unaskable: 1, failed: 0, findings: 1 });
    expect(drainTally()).toEqual({ allowed: 0, denied: 0, unaskable: 0, failed: 0, findings: 0 });
  });

  it('logs a period only when something was asked', () => {
    vi.useFakeTimers();
    try {
      const log = vi.fn();
      startShadowSummary(log, 1000);
      vi.advanceTimersByTime(1000);
      expect(log).not.toHaveBeenCalled();
      countOutcome('failed');
      vi.advanceTimersByTime(1000);
      expect(log).toHaveBeenCalledWith({
        allowed: 0,
        denied: 0,
        unaskable: 0,
        failed: 1,
        findings: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
