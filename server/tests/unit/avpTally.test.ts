import { describe, expect, it } from 'vitest';
import { drainAvpTally, recordAvpAttempt } from '../../src/platform/access/authorizer/avpTally.js';

/** The AVP summary (P11.9): calls, failures by kind and latency, drained each period. */
describe('the AVP tally', () => {
  it('counts calls, failures and throttles, with the p95 and the slowest', () => {
    drainAvpTally();
    for (let ms = 1; ms <= 20; ms += 1) recordAvpAttempt('ok', ms * 10);
    recordAvpAttempt('failed', 200);
    recordAvpAttempt('throttled', 5);
    expect(drainAvpTally()).toEqual({ calls: 22, failed: 1, throttled: 1, p95Ms: 200, maxMs: 200 });
  });

  it('starts each period at zero', () => {
    recordAvpAttempt('ok', 12);
    drainAvpTally();
    expect(drainAvpTally()).toEqual({ calls: 0, failed: 0, throttled: 0, p95Ms: 0, maxMs: 0 });
  });
});
