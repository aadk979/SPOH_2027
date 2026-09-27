import { describe, expect, it } from 'vitest';
import {
  assertAlertActive,
  purgeCutoff,
  raisedPush,
  resolvedPush,
} from '../../src/modules/lostPerson/domain/alertRules.js';

/** Lost-person rules (P06.6): pure, so tested without a database. */

describe('lost-person rules', () => {
  it('resolves only an active alert', () => {
    expect(() => assertAlertActive({ status: 'ACTIVE' })).not.toThrow();
    expect(() => assertAlertActive({ status: 'RESOLVED_FOUND' })).toThrow(
      expect.objectContaining({ code: 'ALERT_ALREADY_RESOLVED', statusCode: 409 }),
    );
  });

  it('purges alerts resolved more than the retention window ago', () => {
    const now = new Date('2027-01-07T12:00:00.000Z');
    expect(purgeCutoff(now, 24).toISOString()).toBe('2027-01-06T12:00:00.000Z');
  });

  it('pushes carry no description, and the stand-down replaces the alert', () => {
    const raised = raisedPush('a1');
    const resolved = resolvedPush('a1');
    expect(JSON.stringify(raised)).not.toMatch(/description|clothing|age/i);
    expect(resolved.tag).toBe(raised.tag);
    expect(raised.audience.everyone).toBe(true);
  });
});
