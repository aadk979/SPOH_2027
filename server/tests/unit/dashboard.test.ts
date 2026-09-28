import { describe, expect, it } from 'vitest';
import { deviceRate, staleDevices } from '../../src/modules/dashboard/domain/signals.js';

/** Dashboard signals (P06.8), without a database. */

describe('dashboard signals', () => {
  it('rates a device over its own active minutes, and flags an implausible rate', () => {
    expect(deviceRate(30, 10, 8)).toEqual({ perMinute: 3, rateAnomaly: false });
    expect(deviceRate(90, 10, 8)).toEqual({ perMinute: 9, rateAnomaly: true });
    // A burst inside one minute is rated over a minute, not over zero.
    expect(deviceRate(5, 0, 8)).toEqual({ perMinute: 5, rateAnomaly: false });
  });

  it('flags a checked-in device quiet for too long, or silent all day', () => {
    const rows = [
      { id: 'recent', minutesSinceLastCapture: 3 },
      { id: 'quiet', minutesSinceLastCapture: 20 },
      { id: 'never', minutesSinceLastCapture: null },
    ];
    expect(staleDevices(rows, 15).map((row) => row.id)).toEqual(['quiet', 'never']);
  });
});
