import { afterEach, describe, expect, it, vi } from 'vitest';
import { countOutcome, drainTally, logDecisionSummary } from './decisionTally.js';

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
    const log = vi.fn();
    logDecisionSummary(log);
    expect(log).not.toHaveBeenCalled();
    countOutcome('failed');
    logDecisionSummary(log);
    expect(log).toHaveBeenCalledWith({ allowed: 0, denied: 0, unaskable: 0, failed: 1 });
  });
});
