import {
  ERROR_CODES,
  outranks,
  roleHasCapability,
  type CommitteeRole,
  type ProvisionVolunteerRequest,
  type ProvisionVolunteerResponse,
  type RosterImportIssue,
  type RosterImportOutcome,
  type RosterImportRequest,
  type RosterImportResponse,
  type RosterImportRow,
  type ShiftAssignmentRecord,
} from '@spoh/shared';
import type { Volunteer } from '../../generated/prisma/client.js';
import { writeAudit, type AuditContext } from '../../lib/audit.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma, type PrismaTransactionClient } from '../../lib/prisma.js';
import { eventDayAnchor } from '../../lib/time.js';
import { invalidateVolunteerCache } from '../../middleware/auth/index.js';
import { revokeAllForVolunteer } from '../auth/service.js';
import { identityProvider } from '../identity/provider.js';
import {
  findEventDayByDate,
  findReportingCycle,
  findStationByCodeTx,
  findVolunteerByEmail,
  listAssignmentsForStation,
  toAssignmentRecord,
  toVolunteerRecord,
  upsertAssignment,
  upsertVolunteer,
} from './repo.js';

/**
 * Roster management and account provisioning (BUILD_PLAN §6.1, §7.2).
 *
 * Provisioning creates the identity and the `Volunteer` row together, so a
 * volunteer who can sign in is by construction a volunteer who is on the
 * roster — an account with no roster row gets `NOT_PROVISIONED` at the door.
 *
 * Both entry points take the acting administrator, because the escalation
 * rules in `admin/service.ts` apply here too: a Chief who can create an Admin
 * account through the provisioning form, or demote one through a CSV, holds
 * every capability in the system by way of a detour.
 */

export interface RosterActor {
  volunteerId: string;
  role: CommitteeRole;
}

function escalation(message: string): AppError {
  return new AppError(403, ERROR_CODES.ROLE_ESCALATION_DENIED, message);
}

export async function provisionVolunteer(
  request: ProvisionVolunteerRequest,
  actor: RosterActor,
  audit: AuditContext,
): Promise<ProvisionVolunteerResponse> {
  if (!outranks(actor.role, request.role)) {
    throw escalation('You cannot grant a role at or above your own.');
  }

  /**
   * An existing email is a conflict, not an update. The form that calls this
   * defaults the role to Volunteer, and a Chief adding "tan@…" without knowing
   * they were already the Room A IC would demote them without ever seeing it.
   * Editing goes through `PATCH /admin/volunteers/:id`, where the current
   * values are on screen.
   */
  const existing = await findVolunteerByEmail(request.email);
  if (existing) {
    throw new ConflictError(
      ERROR_CODES.VOLUNTEER_EXISTS,
      existing.active
        ? `${existing.displayName} is already on the roster. Edit their row instead.`
        : `${existing.displayName} is on the roster but deactivated. Restore their access instead of adding them again.`,
      { volunteerId: existing.id, active: existing.active },
    );
  }

  const reportsTo = request.reportsToEmail
    ? await findVolunteerByEmail(request.reportsToEmail)
    : null;

  if (request.reportsToEmail && !reportsTo) {
    throw new ValidationError('The manager named in reportsToEmail is not on the roster', {
      field: 'reportsToEmail',
    });
  }
  if (reportsTo && !reportsTo.active) {
    throw new ValidationError('The manager named in reportsToEmail has been deactivated', {
      field: 'reportsToEmail',
    });
  }

  const identity = await identityProvider.ensureUser({
    email: request.email,
    displayName: request.displayName,
    role: request.role,
  });

  const volunteer = await prisma.$transaction(async (tx) => {
    const { volunteer: row } = await upsertVolunteer(tx, {
      cognitoSub: identity.sub,
      displayName: request.displayName,
      email: request.email,
      phone: request.phone ?? null,
      role: request.role,
      portfolio: request.portfolio ?? null,
      reportsToId: reportsTo?.id ?? null,
    });

    await writeAudit(tx, {
      ...audit,
      action: 'user.provision',
      entityType: 'Volunteer',
      entityId: row.id,
      after: {
        email: row.email,
        role: row.role,
        active: row.active,
        identityCreated: identity.created,
      },
    });

    return row;
  });

  // The auth middleware caches sub -> volunteer for 60 seconds. A role change
  // should take effect on the next request, not on the next minute.
  invalidateVolunteerCache(identity.sub);

  return { volunteer: toVolunteerRecord(volunteer), identityCreated: identity.created };
}

// ─────────────────────────────────────────────────────────────
// ROSTER IMPORT
// ─────────────────────────────────────────────────────────────

/**
 * The file is one row per shift, so the same person appears once per shift
 * they hold. Person-level fields are taken from their first row; a later row
 * fills in what the first left blank and is reported where it disagrees.
 */
interface Person {
  firstRow: number;
  row: RosterImportRow;
}

const PERSON_FIELDS = ['displayName', 'role', 'phone', 'portfolio', 'reportsToEmail'] as const;

/** What the import may do with one person, decided before anything is written. */
interface Decision {
  action: 'create' | 'update' | 'skip';
  existing: Volunteer | null;
  /** The role the row would leave them with. */
  role: CommitteeRole;
  /** Provider subject; on a dry run for a new person, a placeholder that is rolled back. */
  sub: string | null;
}

/**
 * Roster CSV import.
 *
 * Runs as a dry run unless `commit` is set. Importing 200 volunteers is exactly
 * the operation you want to see the diff of before it happens, and the preview
 * costs one extra request.
 *
 * Rows are processed in one transaction on commit: a half-imported roster on
 * the morning of 6 January would be worse than no import at all.
 *
 * Nothing in the file is fatal. A row the caller may not apply — their own
 * account, an Admin's, a person who does not exist when the caller cannot
 * create accounts — is skipped and reported, and the rest of the file goes in.
 */
export async function importRoster(
  request: RosterImportRequest,
  actor: RosterActor,
  audit: AuditContext,
): Promise<RosterImportResponse> {
  const canProvision = roleHasCapability(actor.role, 'user.provision');
  const issues: RosterImportIssue[] = [];
  const outcomes: RosterImportOutcome[] = [];
  const counters = {
    volunteersCreated: 0,
    volunteersUpdated: 0,
    assignmentsCreated: 0,
    assignmentsUpdated: 0,
    identitiesCreated: 0,
  };

  const issue = (rowNumber: number, field: string, message: string): void => {
    issues.push({ rowNumber, field, message });
  };

  // ── 1. Fold the rows into people ─────────────────────────────────────────
  const people = new Map<string, Person>();

  for (const [index, row] of request.rows.entries()) {
    const rowNumber = index + 1;
    const person = people.get(row.email);

    if (!person) {
      people.set(row.email, { firstRow: rowNumber, row });
      continue;
    }

    for (const field of PERSON_FIELDS) {
      const value = row[field];
      if (value === undefined) continue;
      const first = person.row[field];
      if (first === undefined) {
        person.row = { ...person.row, [field]: value };
      } else if (first !== value) {
        issue(
          rowNumber,
          field,
          `Differs from row ${person.firstRow} for ${row.email}; row ${person.firstRow} is used`,
        );
      }
    }
  }

  // ── 2. Decide what may happen to each person ─────────────────────────────
  // Before any identity is minted: an invite email cannot be rolled back.
  const decisions = new Map<string, Decision>();

  for (const [email, { firstRow, row }] of people) {
    const existing = await findVolunteerByEmail(email);
    const role = row.role ?? existing?.role ?? 'VOLUNTEER';
    const skip = (field: string, message: string): void => {
      issue(firstRow, field, message);
      decisions.set(email, { action: 'skip', existing, role, sub: null });
    };

    if (existing) {
      if (existing.id === actor.volunteerId) {
        skip(
          'email',
          'This is your own account. An import cannot change it; ask another administrator.',
        );
      } else if (!existing.active) {
        skip(
          'email',
          `${existing.displayName} is deactivated` +
            (existing.deactivatedReason ? ` (${existing.deactivatedReason})` : '') +
            '. Restore their access on the roster screen first.',
        );
      } else if (!outranks(actor.role, existing.role)) {
        skip(
          'role',
          `${existing.displayName} holds a role at or above your own. An import cannot change their account.`,
        );
      } else if (!outranks(actor.role, role)) {
        skip('role', `You cannot grant ${role}, which is at or above your own role.`);
      } else {
        decisions.set(email, { action: 'update', existing, role, sub: existing.cognitoSub });
      }
      continue;
    }

    if (!canProvision) {
      skip(
        'email',
        `${email} is not on the roster, and only a Chief Coordinator or Admin can create accounts.`,
      );
    } else if (!outranks(actor.role, role)) {
      skip('role', `You cannot grant ${role}, which is at or above your own role.`);
    } else {
      decisions.set(email, { action: 'create', existing: null, role, sub: null });
    }
  }

  // ── 3. Mint identities for the people being created ──────────────────────
  // Outside the transaction: it is a network call to Cognito, and holding a
  // database transaction open across 200 of them would be a long-running lock
  // for no benefit. Skipped on a dry run, because an invite email cannot be
  // previewed.
  if (request.commit) {
    for (const [email, decision] of decisions) {
      if (decision.action !== 'create') continue;
      const person = people.get(email) as Person;
      const identity = await identityProvider.ensureUser({
        email,
        displayName: person.row.displayName,
        role: decision.role,
      });
      decision.sub = identity.sub;
      if (identity.created) counters.identitiesCreated += 1;
    }
  }

  // ── 4. Apply ─────────────────────────────────────────────────────────────
  const apply = async (tx: PrismaTransactionClient): Promise<{ roleChanged: Volunteer[] }> => {
    const idByEmail = new Map<string, string>();
    const roleChanged: Volunteer[] = [];

    // Pass 1: people. Everyone first, so a reporting line can point at a
    // manager who appears later in the same file.
    for (const [email, decision] of decisions) {
      if (decision.action === 'skip') {
        if (decision.existing) idByEmail.set(email, decision.existing.id);
        continue;
      }

      const { row } = people.get(email) as Person;
      const { volunteer, created } = await upsertVolunteer(tx, {
        // A dry run has no subject yet. The placeholder is unique per person,
        // because `cognitoSub` is, and it is rolled back with everything else.
        cognitoSub: decision.sub ?? `pending:${email}`,
        displayName: row.displayName,
        email,
        phone: row.phone ?? null,
        role: decision.role,
        portfolio: row.portfolio ?? null,
      });

      idByEmail.set(email, volunteer.id);
      if (created) {
        counters.volunteersCreated += 1;
      } else {
        counters.volunteersUpdated += 1;
        if (decision.existing && decision.existing.role !== decision.role) {
          roleChanged.push(volunteer);
        }
      }
    }

    // Pass 2: reporting lines. Resolved against the file first, then the
    // roster, and checked for loops inside this transaction so a cycle that
    // exists only between two rows of the file is caught on the preview.
    for (const [email, { firstRow, row }] of people) {
      if (!row.reportsToEmail) continue;
      const decision = decisions.get(email) as Decision;
      if (decision.action === 'skip') continue;

      const volunteerId = idByEmail.get(email) as string;
      let managerId = idByEmail.get(row.reportsToEmail);

      if (!managerId) {
        const manager = await findVolunteerByEmail(row.reportsToEmail, tx);
        if (manager && !manager.active) {
          issue(firstRow, 'reportsToEmail', `${manager.displayName} has been deactivated`);
          continue;
        }
        managerId = manager?.id;
      }

      if (!managerId) {
        issue(
          firstRow,
          'reportsToEmail',
          `No volunteer with email ${row.reportsToEmail} in this file or on the roster`,
        );
        continue;
      }

      const cycle = await findReportingCycle(tx, volunteerId, managerId);
      if (cycle) {
        issue(
          firstRow,
          'reportsToEmail',
          cycle === 'self'
            ? 'Somebody cannot report to themselves'
            : 'That reporting line would form a loop',
        );
        continue;
      }

      await tx.volunteer.update({ where: { id: volunteerId }, data: { reportsToId: managerId } });
    }

    // Pass 3: shifts, one per row.
    const shiftKeys = new Set<string>();

    for (const [index, row] of request.rows.entries()) {
      const rowNumber = index + 1;
      const decision = decisions.get(row.email) as Decision;
      const outcome: RosterImportOutcome = {
        rowNumber,
        email: row.email,
        person: decision.action,
        assignment: 'none',
      };
      outcomes.push(outcome);

      // An assignment needs all three of station, date and block. A row with
      // only some of them describes a person, not a shift, and is skipped
      // rather than guessed at.
      const hasAssignment = row.stationCode && row.eventDate && row.block;
      if (!hasAssignment) {
        if (row.stationCode || row.eventDate || row.block) {
          issue(
            rowNumber,
            'stationCode/eventDate/block',
            'A shift needs all of stationCode, eventDate and block',
          );
          outcome.assignment = 'skip';
        }
        continue;
      }

      outcome.assignment = 'skip';

      // A person who was refused can still be rostered — `roster.edit` covers
      // shifts, and a Chief may well roster an Admin at a station — unless
      // they do not exist or cannot sign in.
      const volunteerId = idByEmail.get(row.email);
      if (!volunteerId) continue;
      if (decision.existing && !decision.existing.active) continue;

      const key = `${row.email}|${row.eventDate}|${row.block}`;
      if (shiftKeys.has(key)) {
        issue(
          rowNumber,
          'block',
          `${row.email} already has a ${row.block} shift on ${row.eventDate} earlier in this file`,
        );
        continue;
      }
      shiftKeys.add(key);

      const station = await findStationByCodeTx(tx, row.stationCode as string);
      if (!station) {
        issue(rowNumber, 'stationCode', `Unknown station code ${row.stationCode as string}`);
        continue;
      }
      if (!station.active) {
        issue(rowNumber, 'stationCode', `${station.name} (${row.stationCode as string}) is closed`);
        continue;
      }

      const eventDay = await findEventDayByDate(tx, eventDayAnchor(row.eventDate as string));
      if (!eventDay) {
        issue(rowNumber, 'eventDate', `${row.eventDate as string} is not a configured event day`);
        continue;
      }

      const result = await upsertAssignment(tx, {
        volunteerId,
        stationId: station.id,
        eventDayId: eventDay.id,
        block: row.block as NonNullable<typeof row.block>,
        roleLabel: row.roleLabel ?? 'Volunteer',
      });

      outcome.assignment = result.created ? 'create' : 'update';
      if (result.created) counters.assignmentsCreated += 1;
      else counters.assignmentsUpdated += 1;
    }

    return { roleChanged };
  };

  const volunteersSkipped = [...decisions.values()].filter((d) => d.action === 'skip').length;

  if (request.commit) {
    const { roleChanged } = await prisma.$transaction(async (tx) => {
      const result = await apply(tx);
      await writeAudit(tx, {
        ...audit,
        action: 'roster.import',
        entityType: 'Volunteer',
        entityId: null,
        after: { rowCount: request.rows.length, ...counters, volunteersSkipped },
      });
      return result;
    });

    // A changed role is a change to what somebody may do, and their sessions
    // must not outlive it — the same rule as editing them one at a time.
    for (const volunteer of roleChanged) {
      await revokeAllForVolunteer(volunteer.id, 'role-changed');
      try {
        await identityProvider.ensureUser({
          email: volunteer.email,
          displayName: volunteer.displayName,
          role: volunteer.role,
        });
      } catch (error) {
        logger.error(
          { err: error, volunteerId: volunteer.id },
          'role changed by import but the identity provider group could not be updated',
        );
      }
    }

    invalidateVolunteerCache();
  } else {
    // Dry run: apply inside a transaction that is deliberately rolled back, so
    // the preview reflects what would really happen — including constraint
    // violations — without writing anything.
    await prisma
      .$transaction(async (tx) => {
        await apply(tx);
        throw new DryRunRollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof DryRunRollback)) throw error;
      });
  }

  return { committed: request.commit, ...counters, volunteersSkipped, outcomes, issues };
}

/** Sentinel used to roll back the dry-run transaction. Never surfaces. */
class DryRunRollback extends Error {
  constructor() {
    super('roster import dry run');
    this.name = 'DryRunRollback';
  }
}

export async function getStationRoster(
  stationId: string,
  eventDayId?: string,
): Promise<ShiftAssignmentRecord[]> {
  const station = await prisma.station.findUnique({ where: { id: stationId } });
  if (!station) throw new NotFoundError('Station');

  const assignments = await listAssignmentsForStation(stationId, eventDayId);
  return assignments.map(toAssignmentRecord);
}
