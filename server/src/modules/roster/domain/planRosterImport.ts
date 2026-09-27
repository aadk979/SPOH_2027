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
  /** Managers the file names who are on the roster but not in the file, by email. */
  rosterManagers: ReadonlyMap<string, { id: string; active: boolean }>;
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
  /** Set when the manager is already on the roster rather than in the file. */
  managerId: string | null;
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

const DEACTIVATED = 'deactivated' as const;
/** A new person the importer may not create (F03-043). */
const NOT_ADDED = 'not-added' as const;

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
function planPerson(
  row: RosterImportRow,
  context: {
    existing: { role: CommitteeRole } | undefined;
    first: boolean;
    plan: RosterImportPlan;
  },
) {
  const { existing, first, plan } = context;
  const created = !existing && first;
  plan.people.push({
    row,
    created,
    // Audited once per person, at their first row (F03-044).
    roleChangedFrom: first && existing && existing.role !== row.role ? existing.role : null,
  });
  // Counted once per person, not per row: a new volunteer with two shifts is
  // one volunteer created, not one created and one updated (F03-025).
  if (!first) return;
  if (created) plan.counters.volunteersCreated += 1;
  else plan.counters.volunteersUpdated += 1;
}

function planPeople(
  rows: readonly RosterImportRow[],
  context: { snapshot: ImportSnapshot; mayCreate: boolean },
  plan: RosterImportPlan,
) {
  const seen = new Map<string, string>();
  for (const [index, row] of rows.entries()) {
    const existing = context.snapshot.existing.get(row.email);
    const first = !seen.has(row.email);
    if (existing && !existing.active) {
      if (first) plan.issues.push(deactivatedPerson(row.email, index + 1));
      seen.set(row.email, DEACTIVATED);
      continue;
    }
    // Creating people and sending invites is `user.provision`, which roster
    // editing does not carry: without it, a new person is reported, not created.
    if (!existing && !context.mayCreate) {
      if (first) plan.issues.push(notAdded(row.email, index + 1));
      seen.set(row.email, NOT_ADDED);
      continue;
    }
    seen.set(row.email, 'active');
    planPerson(row, { existing, first, plan });
  }
  return seen;
}

function notAdded(email: string, rowNumber: number) {
  return {
    rowNumber,
    field: 'email',
    message: `${email} is not on the roster. Only a Chief or Admin can add new people.`,
  };
}

function deactivatedPerson(email: string, rowNumber: number) {
  return {
    rowNumber,
    field: 'email',
    message: `${email} is deactivated. Restore their access before importing them.`,
  };
}

function deactivatedManager(managerEmail: string, rowNumber: number) {
  return {
    rowNumber,
    field: 'reportsToEmail',
    message: `${managerEmail} is deactivated and cannot be a manager`,
  };
}

/** A manager named by email: in the file (id not known yet), on the roster, deactivated, or nobody. */
function findManager(
  email: string,
  lookup: { seen: ReadonlyMap<string, string>; snapshot: ImportSnapshot },
): { id: string | null } | typeof DEACTIVATED | null {
  const inFile = lookup.seen.get(email);
  if (inFile === NOT_ADDED) return null;
  if (inFile) return inFile === DEACTIVATED ? DEACTIVATED : { id: null };
  const onRoster = lookup.snapshot.rosterManagers.get(email);
  if (!onRoster) return null;
  return onRoster.active ? { id: onRoster.id } : DEACTIVATED;
}

/**
 * The row's manager, from the file or from the roster (F03-044). A person the
 * import skips gets no link: their row already carries the reason.
 */
function planLink(state: PlanState, { row, rowNumber }: RowAt) {
  const { seen, plan, snapshot } = state;
  const managerEmail = row.reportsToEmail;
  if (!managerEmail || seen.get(row.email) !== 'active') return;

  const manager = findManager(managerEmail, { seen, snapshot });
  if (manager === DEACTIVATED) {
    plan.issues.push(deactivatedManager(managerEmail, rowNumber));
  } else if (manager) {
    plan.links.push({ email: row.email, managerEmail, managerId: manager.id });
  } else {
    plan.issues.push({
      rowNumber,
      field: 'reportsToEmail',
      message: `No volunteer with email ${managerEmail} in this file or on the roster`,
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
  options: { mayCreate: boolean } = { mayCreate: true },
): RosterImportPlan {
  const plan = emptyPlan();
  const state: PlanState = {
    snapshot,
    plan,
    seen: planPeople(rows, { snapshot, mayCreate: options.mayCreate }, plan),
    planned: new Set(),
  };
  for (const [index, row] of rows.entries()) {
    planLink(state, { row, rowNumber: index + 1 });
    planAssignment(state, { row, rowNumber: index + 1 });
  }
  return plan;
}
