import { describe, expect, it } from 'vitest';
import { assertIncidentTransition } from '../../src/modules/incident/domain/statusTransitions.js';
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
    ).toEqual({ title: 'HIGH incident reported', body: 'near miss at Room A. Open the ops app.' });
    expect(
      safetyPushMessage({ severity: 'CRITICAL', type: 'INJURY', stationName: null }).body,
    ).toBe('injury at an unlisted location. Open the ops app.');
  });
});

describe('incident transitions (F03-024)', () => {
  const statuses = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
  const allowed = new Set([
    'OPEN>ACKNOWLEDGED',
    'OPEN>RESOLVED',
    'ACKNOWLEDGED>RESOLVED',
    'RESOLVED>OPEN',
  ]);

  // Every pair, so a change to the table is a visible change to this test.
  for (const from of statuses) {
    for (const to of statuses) {
      const ok = allowed.has(`${from}>${to}`);
      it(`${from} → ${to} is ${ok ? 'allowed' : 'refused'}`, () => {
        const run = (): void => assertIncidentTransition(from, to, 'because');
        if (ok) expect(run).not.toThrow();
        else expect(run).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
      });
    }
  }

  it('reopens a resolved incident only with a note', () => {
    expect(() => assertIncidentTransition('RESOLVED', 'OPEN', undefined)).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
    expect(() => assertIncidentTransition('RESOLVED', 'OPEN', 'visitor came back')).not.toThrow();
  });
});
