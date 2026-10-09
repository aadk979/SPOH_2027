import { afterEach, describe, expect, it, vi } from 'vitest';
import { countOutcome, drainTally, startDecisionSummary } from './decisionTally.js';

describe('the decision tally', () => {
  afterEach(() => {
    drainTally();
  });

  it('counts each outcome until drained', () => {
    countOutcome('allowed');
    countOutcome('allowed');
    countOutcome('denied');
    countOutcome('unaskable');
    expect(drainTally()).toEqual({ allowed: 2, denied: 1, unaskable: 1, failed: 0 });
    expect(drainTally()).toEqual({ allowed: 0, denied: 0, unaskable: 0, failed: 0 });
  });

  it('logs a period only when something was asked', () => {
    vi.useFakeTimers();
    try {
      const log = vi.fn();
      startDecisionSummary(log, 1000);
      vi.advanceTimersByTime(1000);
      expect(log).not.toHaveBeenCalled();
      countOutcome('failed');
      vi.advanceTimersByTime(1000);
      expect(log).toHaveBeenCalledWith({ allowed: 0, denied: 0, unaskable: 0, failed: 1 });
    } finally {
      vi.useRealTimers();
    }
  });
});
