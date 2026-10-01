import { describe, expect, it } from 'vitest';
import { EventStatus } from '@spoh/shared';
import {
  evaluateTransition,
  GO_LIVE_CHECKS,
  type LifecycleSnapshot,
} from '../../src/modules/event/domain/lifecycle.js';

const NOW = new Date('2027-01-07T10:00:00.000Z');
const LEGAL = new Set([
  'DRAFT>READY',
  'READY>DRAFT',
  'READY>REHEARSAL',
  'REHEARSAL>READY',
  'READY>LIVE',
  'LIVE>CLOSED',
  'CLOSED>LIVE',
  'CLOSED>ARCHIVED',
]);

function snapshot(from: LifecycleSnapshot['from']): LifecycleSnapshot {
  return {
    from,
    structure: {
      timezoneValid: true,
      eventDays: 1,
      shiftTemplates: 1,
      stationTypes: 1,
      registrationStationTypes: 1,
      categories: 1,
    },
    goLiveChecks: GO_LIVE_CHECKS.map((code) => ({ code, passed: true })),
    hasBeenLive: false,
    closedAt: new Date(NOW.getTime() - 3600_000),
    archive: {
      lostPersonPurgeComplete: true,
      finalReportExists: true,
      captureGracePeriodComplete: true,
    },
  };
}

const context = { now: NOW, platformAdmin: true, reason: 'Correct a mistaken close' };

describe('event lifecycle (ADR-004)', () => {
  it('allows exactly the documented edges across all state pairs', () => {
    for (const from of EventStatus.options) {
      for (const to of EventStatus.options) {
        const result = evaluateTransition(snapshot(from), to, context);
        expect(result.allowed, `${from} → ${to}`).toBe(LEGAL.has(`${from}>${to}`));
        if (!result.allowed && !LEGAL.has(`${from}>${to}`)) {
          expect(result.blockers).toEqual(['illegal-transition']);
        }
      }
    }
  });

  it('names the action and effect of entering and leaving rehearsal', () => {
    expect(evaluateTransition(snapshot('READY'), 'REHEARSAL', context)).toMatchObject({
      action: 'Event.Rehearse',
      effects: ['rehearsal.open'],
      allowed: true,
    });
    expect(evaluateTransition(snapshot('REHEARSAL'), 'READY', context)).toMatchObject({
      action: 'Event.Rehearse',
      effects: ['rehearsal.close'],
      allowed: true,
    });
  });

  it('requires structure before READY or REHEARSAL, including categories for registration', () => {
    const incomplete = snapshot('DRAFT');
    incomplete.structure = {
      timezoneValid: false,
      eventDays: 0,
      shiftTemplates: 0,
      stationTypes: 0,
      registrationStationTypes: 1,
      categories: 0,
    };
    expect(evaluateTransition(incomplete, 'READY', context).blockers).toEqual([
      'timezone',
      'event-days',
      'shift-templates',
      'station-types',
      'categories',
    ]);
    incomplete.from = 'READY';
    expect(evaluateTransition(incomplete, 'REHEARSAL', context).allowed).toBe(false);
    incomplete.structure = { ...incomplete.structure, registrationStationTypes: 0 };
    expect(evaluateTransition(incomplete, 'REHEARSAL', context).blockers).not.toContain(
      'categories',
    );
  });

  it('fails go-live closed when the checklist is absent or any item fails', () => {
    const ready = snapshot('READY');
    ready.goLiveChecks = [];
    expect(evaluateTransition(ready, 'LIVE', context).blockers).toContain(
      'go-live-checklist-unavailable',
    );
    ready.goLiveChecks = [{ code: 'shift-coverage', passed: true }];
    expect(evaluateTransition(ready, 'LIVE', context).blockers).toContain(
      'go-live:attendance:missing',
    );
    ready.goLiveChecks = GO_LIVE_CHECKS.map((code) => ({
      code,
      passed: code !== 'attendance',
    }));
    expect(evaluateTransition(ready, 'LIVE', context).blockers).toEqual(['go-live:attendance']);
    ready.goLiveChecks = ready.goLiveChecks.map((check) => ({ ...check, passed: true }));
    expect(evaluateTransition(ready, 'LIVE', context).allowed).toBe(true);
  });

  it('returns to DRAFT only before this event has ever been live', () => {
    const ready = snapshot('READY');
    ready.hasBeenLive = true;
    expect(evaluateTransition(ready, 'DRAFT', context).blockers).toEqual(['already-live']);
  });

  it('reopens only within 48 hours for a platform admin giving a reason', () => {
    const closed = snapshot('CLOSED');
    closed.closedAt = new Date(NOW.getTime() - 48 * 3600_000);
    expect(evaluateTransition(closed, 'LIVE', context).allowed).toBe(true);
    closed.closedAt = new Date(NOW.getTime() - 48 * 3600_000 - 1);
    expect(evaluateTransition(closed, 'LIVE', { now: NOW }).blockers).toEqual([
      'reopen-window-expired',
      'platform-admin-required',
      'reason-required',
    ]);
  });

  it('archives only after purge, final report and capture grace period', () => {
    const closed = snapshot('CLOSED');
    closed.archive = {
      lostPersonPurgeComplete: false,
      finalReportExists: false,
      captureGracePeriodComplete: false,
    };
    expect(evaluateTransition(closed, 'ARCHIVED', context).blockers).toEqual([
      'lost-person-purge',
      'final-report',
      'capture-grace-period',
    ]);
  });
});
