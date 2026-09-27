import { describe, expect, it } from 'vitest';
import {
  pushesToSafetyChain,
  safetyPushMessage,
} from '../../src/modules/incident/domain/safetyPush.js';

/** Incident push rules (P06.6): pure, so tested without a database. */

describe('safety chain push', () => {
  it.each([
    ['LOW', false],
    ['MEDIUM', false],
    ['HIGH', true],
    ['CRITICAL', true],
  ] as const)('%s pushes: %s', (severity, pushes) => {
    expect(pushesToSafetyChain(severity)).toBe(pushes);
  });

  it('says what and where, never the description', () => {
    expect(
      safetyPushMessage({ severity: 'HIGH', type: 'NEAR_MISS', stationName: 'Room A' }),
    ).toEqual({ title: 'HIGH incident reported', body: 'near miss at Room A. Open SPOH Ops.' });
    expect(
      safetyPushMessage({ severity: 'CRITICAL', type: 'INJURY', stationName: null }).body,
    ).toBe('injury at an unlisted location. Open SPOH Ops.');
  });
});
