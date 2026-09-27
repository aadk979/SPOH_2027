import type { RosterImportRow } from '@spoh/shared';
import { describe, expect, it } from 'vitest';
import {
  planRosterImport,
  type ImportSnapshot,
} from '../../src/modules/roster/domain/planRosterImport.js';

/** The roster import plan (P06.7): what a file would do, with no database. */

const row = (fields: Partial<RosterImportRow> & { email: string }): RosterImportRow =>
  ({ displayName: fields.email, role: 'VOLUNTEER', ...fields }) as RosterImportRow;

const snapshot = (overrides: Partial<ImportSnapshot> = {}): ImportSnapshot => ({
  existing: new Map(),
  stationIdByCode: new Map([['DESK', 's-desk']]),
  eventDayIdByDate: new Map([['2027-01-07', 'd-1']]),
  heldSlots: new Set(),
  rosterManagers: new Map(),
  ...overrides,
});

const shift = { stationCode: 'DESK', eventDate: '2027-01-07', block: 'MORNING' as const };

describe('planRosterImport', () => {
  it('creates new people and their shifts', () => {
    const plan = planRosterImport([row({ email: 'a@x', ...shift })], snapshot());
    expect(plan.counters).toEqual({
      volunteersCreated: 1,
      volunteersUpdated: 0,
      assignmentsCreated: 1,
      assignmentsUpdated: 0,
    });
    expect(plan.assignments[0]).toMatchObject({
      email: 'a@x',
      stationId: 's-desk',
      eventDayId: 'd-1',
      roleLabel: 'Volunteer',
    });
    expect(plan.issues).toEqual([]);
  });

  it('updates an existing person and a slot they already hold, noting a role change', () => {
    const plan = planRosterImport(
      [row({ email: 'b@x', role: 'IC', ...shift })],
      snapshot({
        existing: new Map([['b@x', { id: 'v-b', role: 'VOLUNTEER' as const, active: true }]]),
        heldSlots: new Set(['v-b|d-1|MORNING']),
      }),
    );
    expect(plan.counters).toMatchObject({ volunteersUpdated: 1, assignmentsUpdated: 1 });
    expect(plan.people[0]?.roleChangedFrom).toBe('VOLUNTEER');
  });

  it('skips a deactivated person with one issue, however many rows they have', () => {
    const plan = planRosterImport(
      [row({ email: 'c@x', ...shift }), row({ email: 'c@x' })],
      snapshot({
        existing: new Map([['c@x', { id: 'v-c', role: 'VOLUNTEER' as const, active: false }]]),
      }),
    );
    expect(plan.people).toHaveLength(0);
    expect(plan.assignments).toHaveLength(0);
    expect(plan.issues.map((issue) => issue.field)).toEqual(['email']);
  });

  it('reports a partial shift, an unknown station and an unknown day, in row order', () => {
    const plan = planRosterImport(
      [
        row({ email: 'd@x', stationCode: 'DESK' }),
        row({ email: 'e@x', ...shift, stationCode: 'NOPE' }),
        row({ email: 'f@x', ...shift, eventDate: '2027-02-01' }),
      ],
      snapshot(),
    );
    expect(plan.issues.map((issue) => [issue.rowNumber, issue.field])).toEqual([
      [1, 'stationCode/eventDate/block'],
      [2, 'stationCode'],
      [3, 'eventDate'],
    ]);
    expect(plan.assignments).toHaveLength(0);
  });

  it('links a manager named later in the file, and reports one who is not in it', () => {
    const plan = planRosterImport(
      [
        row({ email: 'g@x', reportsToEmail: 'h@x' }),
        row({ email: 'h@x' }),
        row({ email: 'i@x', reportsToEmail: 'zz@x' }),
      ],
      snapshot(),
    );
    expect(plan.links).toEqual([{ email: 'g@x', managerEmail: 'h@x', managerId: null }]);
    expect(plan.issues.map((issue) => issue.rowNumber)).toEqual([3]);
  });

  it('counts people once each, however many rows they have (F03-025)', () => {
    const plan = planRosterImport(
      [row({ email: 'n@x', ...shift }), row({ email: 'n@x', ...shift, block: 'AFTERNOON' })],
      snapshot(),
    );
    expect(plan.counters).toMatchObject({
      volunteersCreated: 1,
      volunteersUpdated: 0,
      assignmentsCreated: 2,
    });
  });
});
