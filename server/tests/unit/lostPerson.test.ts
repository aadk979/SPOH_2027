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
    const raised = raisedPush({ id: 'a1', rehearsal: false });
    const resolved = resolvedPush({ id: 'a1', rehearsal: false });
    for (const push of [raised, resolved]) {
      expect(Object.keys(push)).not.toEqual(
        expect.arrayContaining(['descriptionText', 'clothingText', 'approxAge']),
      );
    }
    expect(resolved.tag).toBe(raised.tag);
    expect(raised.audience.everyone).toBe(true);
  });

  it('labels practice raise and stand-down notifications using the alert provenance', () => {
    const alert = { id: 'practice', rehearsal: true };
    for (const push of [raisedPush(alert), resolvedPush(alert)]) {
      expect(push.title).toMatch(/^REHEARSAL · /);
      expect(push.body).toMatch(/practice/i);
      expect(push.tag).toBe('lost-person:practice');
      expect(JSON.stringify(push)).not.toMatch(/descriptionText|clothingText|approxAge/);
    }
    expect(raisedPush({ ...alert, rehearsal: false }).title).toBe(
      'Lost person — check your app now',
    );
    expect(resolvedPush({ ...alert, rehearsal: false }).title).toBe('Lost person resolved');
  });
});
