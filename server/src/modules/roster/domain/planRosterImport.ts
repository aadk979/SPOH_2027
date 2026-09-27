import type { CommitteeRole, RosterImportIssue, RosterImportRow } from '@spoh/shared';

/**
 * The roster import as a plan (P06.7): what the file would do, worked out from
 * the file and a snapshot of the roster, with no writes. The preview is the
 * plan; a commit applies it. Two passes, as before: everyone first, so a
 * `reportsToEmail` can name a manager who appears later in the same file.
 */

export interface ImportSnapshot {
  /** Existing accounts the file names, by email. */
  existing: ReadonlyMap<string, { id: string; role: CommitteeRole; active: boolean }>;
  stationIdByCode: ReadonlyMap<string, string>;
  eventDayIdByDate: ReadonlyMap<string, string>;
  /** Slots existing volunteers hold, as volunteerId|eventDayId|block. */
  heldSlots: ReadonlySet<string>;
}

export interface PersonStep {
  row: RosterImportRow;
  created: boolean;
  /** The role an existing account had, when this row changes it. */
  roleChangedFrom: CommitteeRole | null;
}

export interface LinkStep {
  email: string;
  managerEmail: string;
  /** The row's own person is deactivated: applying this link fails (see the import). */
  personDeactivated: boolean;
}

export interface AssignmentStep {
  email: string;
  stationId: string;
  eventDayId: string;
  block: NonNullable<RosterImportRow['block']>;
  roleLabel: string;
  created: boolean;
}

export interface RosterImportPlan {
  people: PersonStep[];
  links: LinkStep[];
  assignments: AssignmentStep[];
  issues: RosterImportIssue[];
  counters: {
    volunteersCreated: number;
    volunteersUpdated: number;
    assignmentsCreated: number;
    assignmentsUpdated: number;
  };
}

const DEACTIVATED = 'deactivated';

/** What the second pass reads and writes as it walks the rows. */
interface PlanState {
  snapshot: ImportSnapshot;
  plan: RosterImportPlan;
  /** Each email's status after the first pass: 'active' or 'deactivated'. */
  seen: ReadonlyMap<string, string>;
  /** Slots this file has already filled, as owner|eventDayId|block. */
  planned: Set<string>;
}

interface RowAt {
  row: RosterImportRow;
  rowNumber: number;
}

function emptyPlan(): RosterImportPlan {
  return {
    people: [],
    links: [],
    assignments: [],
    issues: [],
    counters: {
      volunteersCreated: 0,
      volunteersUpdated: 0,
      assignmentsCreated: 0,
      assignmentsUpdated: 0,
    },
  };
}

/**
 * Pass one: who the file creates or updates. A deactivated account is restored
 * through the admin screen, where the reason it was deactivated is on show,
 * not by appearing in a CSV. Returns each email's status: 'active' or
 * 'deactivated'.
 */
function planPeople(
  rows: readonly RosterImportRow[],
  snapshot: ImportSnapshot,
  plan: RosterImportPlan,
) {
  const seen = new Map<string, string>();
  for (const [index, row] of rows.entries()) {
    const existing = snapshot.existing.get(row.email);
    if (existing && !existing.active) {
      if (!seen.has(row.email)) {
        seen.set(row.email, DEACTIVATED);
        plan.issues.push({
          rowNumber: index + 1,
          field: 'email',
          message: `${row.email} is deactivated. Restore their access before importing them.`,
        });
      }
      continue;
    }
    const first = !seen.has(row.email);
    const created = !existing && first;
    seen.set(row.email, 'active');
    plan.people.push({
      row,
      created,
      roleChangedFrom: existing && existing.role !== row.role ? existing.role : null,
    });
    // Counted once per person, not per row: a new volunteer with two shifts is
    // one volunteer created, not one created and one updated (F03-025).
    if (first && created) plan.counters.volunteersCreated += 1;
    else if (first) plan.counters.volunteersUpdated += 1;
  }
  return seen;
}

function planLink(state: PlanState, { row, rowNumber }: RowAt) {
  const { seen, plan } = state;
  if (!row.reportsToEmail) return;
  const manager = seen.get(row.reportsToEmail);
  if (manager === DEACTIVATED) {
    plan.issues.push({
      rowNumber,
      field: 'reportsToEmail',
      message: `${row.reportsToEmail} is deactivated and cannot be a manager`,
    });
  } else if (!manager) {
    plan.issues.push({
      rowNumber,
      field: 'reportsToEmail',
      message: `No volunteer with email ${row.reportsToEmail} in this file or on the roster`,
    });
  } else {
    plan.links.push({
      email: row.email,
      managerEmail: row.reportsToEmail,
      personDeactivated: seen.get(row.email) === DEACTIVATED,
    });
  }
}

/** The row's shift, if it names a whole one; an issue for any part it gets wrong. */
function resolveShift(state: PlanState, { row, rowNumber }: RowAt) {
  const { snapshot, plan } = state;
  // An assignment needs all three of station, date and block. A row with only
  // some of them describes a person, not a shift, and is skipped rather than
  // guessed at.
  if (!row.stationCode || !row.eventDate || !row.block) {
    if (row.stationCode || row.eventDate || row.block) {
      plan.issues.push({
        rowNumber,
        field: 'stationCode/eventDate/block',
        message: 'A shift assignment needs all of stationCode, eventDate and block',
      });
    }
    return null;
  }
  const stationId = snapshot.stationIdByCode.get(row.stationCode);
  if (!stationId) {
    plan.issues.push({
      rowNumber,
      field: 'stationCode',
      message: `Unknown station code ${row.stationCode}`,
    });
    return null;
  }
  const eventDayId = snapshot.eventDayIdByDate.get(row.eventDate);
  if (!eventDayId) {
    plan.issues.push({
      rowNumber,
      field: 'eventDate',
      message: `${row.eventDate} is not a configured event day`,
    });
    return null;
  }
  return { stationId, eventDayId, block: row.block };
}

function planAssignment(state: PlanState, at: RowAt) {
  const { row } = at;
  const { snapshot, seen, planned, plan } = state;
  const shift = resolveShift(state, at);
  if (!shift || seen.get(row.email) !== 'active') return;

  const owner = snapshot.existing.get(row.email)?.id ?? row.email;
  const slot = `${owner}|${shift.eventDayId}|${shift.block}`;
  const created = !snapshot.heldSlots.has(slot) && !planned.has(slot);
  planned.add(slot);
  plan.assignments.push({
    email: row.email,
    ...shift,
    roleLabel: row.roleLabel ?? 'Volunteer',
    created,
  });
  if (created) plan.counters.assignmentsCreated += 1;
  else plan.counters.assignmentsUpdated += 1;
}

export function planRosterImport(
  rows: readonly RosterImportRow[],
  snapshot: ImportSnapshot,
): RosterImportPlan {
  const plan = emptyPlan();
  const state: PlanState = {
    snapshot,
    plan,
    seen: planPeople(rows, snapshot, plan),
    planned: new Set(),
  };
  for (const [index, row] of rows.entries()) {
    planLink(state, { row, rowNumber: index + 1 });
    planAssignment(state, { row, rowNumber: index + 1 });
  }
  return plan;
}
