import {
  ERROR_CODES,
  ROLE_PRECEDENCE,
  type CommitteeRole,
  type ProvisionVolunteerRequest,
  type ProvisionVolunteerResponse,
  type RosterImportIssue,
  type RosterImportRequest,
  type RosterImportResponse,
  type ShiftAssignmentRecord,
} from '@spoh/shared';
import type { Volunteer } from '../../generated/prisma/client.js';
import { writeAudit, type AuditContext } from '../../lib/audit.js';
import { AppError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { eventDayAnchor } from '../../lib/time.js';
import { invalidateVolunteerCache } from '../../middleware/auth/index.js';
import { identityProvider } from '../identity/provider.js';
import {
  findEventDayByDate,
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
 * rules in `admin/service.ts` apply here too (F03-001): not your own account,
 * nobody at or above you, and no role at or above yours. Otherwise a Deputy
 * with `roster.edit` could make themselves an Admin with a one-row CSV.
 */

export interface RosterActor {
  volunteerId: string;
  role: CommitteeRole;
}

/** True when `actor` is strictly more privileged than `subject`. */
function outranks(actor: CommitteeRole, subject: CommitteeRole): boolean {
  return ROLE_PRECEDENCE[actor] < ROLE_PRECEDENCE[subject];
}

/**
 * Refuse a role grant or an edit of `existing` that the actor may not make.
 * `where` names the row in an import, so the refusal says which line to fix.
 */
function assertMayManage(
  actor: RosterActor,
  change: { role: CommitteeRole; existing: Volunteer | null },
  where = '',
): void {
  if (change.existing?.id === actor.volunteerId) {
    throw new AppError(
      403,
      ERROR_CODES.SELF_MUTATION_DENIED,
      `${where}You cannot change your own account. Ask another administrator.`,
    );
  }
  if (!outranks(actor.role, change.role)) {
    throw new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      `${where}You cannot grant a role at or above your own.`,
    );
  }
  if (change.existing && !outranks(actor.role, change.existing.role)) {
    throw new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      `${where}You cannot change an account at or above your own level.`,
    );
  }
}

export async function provisionVolunteer(
  request: ProvisionVolunteerRequest,
  actor: RosterActor,
  audit: AuditContext,
): Promise<ProvisionVolunteerResponse> {
  const reportsTo = request.reportsToEmail
    ? await findVolunteerByEmail(request.reportsToEmail)
    : null;

  if (request.reportsToEmail && !reportsTo) {
    throw new ValidationError('The manager named in reportsToEmail is not on the roster', {
      field: 'reportsToEmail',
    });
  }

  const existing = await findVolunteerByEmail(request.email);
  assertMayManage(actor, { role: request.role, existing });

  // Only mint an identity for someone who does not have one. Re-provisioning is
  // a normal operation (a role change, a corrected phone number) and must not
  // send a second invite email to someone who already signed in.
  const identity = existing
    ? { sub: existing.cognitoSub, created: false }
    : await identityProvider.ensureUser({
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
      ...(existing ? { before: { role: existing.role, active: existing.active } } : {}),
      after: { email: row.email, role: row.role, active: row.active },
    });

    return row;
  });

  // The auth middleware caches sub -> volunteer for 60 seconds. A role change
  // should take effect on the next request, not on the next minute.
  invalidateVolunteerCache(identity.sub);

  return { volunteer: toVolunteerRecord(volunteer), identityCreated: identity.created };
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
 */
export async function importRoster(
  request: RosterImportRequest,
  actor: RosterActor,
  audit: AuditContext,
): Promise<RosterImportResponse> {
  const issues: RosterImportIssue[] = [];
  const existingByEmail = await loadExistingForImport(request, actor);
  const counters = {
    volunteersCreated: 0,
    volunteersUpdated: 0,
    assignmentsCreated: 0,
    assignmentsUpdated: 0,
  };

  // Identities are minted outside the transaction: it is a network call to
  // Cognito, and holding a database transaction open across 200 of them would
  // be a long-running lock for no benefit.
  const identities = new Map<string, string>();
  for (const row of request.rows) {
    if (identities.has(row.email)) continue;
    const existing = existingByEmail.get(row.email);
    if (existing) {
      identities.set(row.email, existing.cognitoSub);
    } else if (request.commit) {
      const identity = await identityProvider.ensureUser({
        email: row.email,
        displayName: row.displayName,
        role: row.role,
      });
      identities.set(row.email, identity.sub);
    } else {
      // Dry run: no identity is created, so use a placeholder that is never
      // written. It exists only so the preview can report what would happen.
      identities.set(row.email, 'pending');
    }
  }

  const apply = async (tx: Parameters<typeof upsertVolunteer>[0]) => {
    // Two passes: everyone is created first, so `reportsToEmail` can reference
    // a manager that appears later in the same file.
    const byEmail = new Map<string, string>();

    for (const [index, row] of request.rows.entries()) {
      // A deactivated account is restored through the admin screen, where the
      // reason it was deactivated is on show, not by appearing in a CSV.
      const existing = existingByEmail.get(row.email);
      if (existing && !existing.active) {
        if (!byEmail.has(row.email)) {
          byEmail.set(row.email, DEACTIVATED);
          issues.push({
            rowNumber: index + 1,
            field: 'email',
            message: `${row.email} is deactivated. Restore their access before importing them.`,
          });
        }
        continue;
      }

      const { volunteer, created } = await upsertVolunteer(tx, {
        cognitoSub: identities.get(row.email) ?? 'pending',
        displayName: row.displayName,
        email: row.email,
        phone: row.phone ?? null,
        role: row.role,
        portfolio: row.portfolio ?? null,
      });

      byEmail.set(row.email, volunteer.id);
      if (created) counters.volunteersCreated += 1;
      else counters.volunteersUpdated += 1;

      // `roster.import` records counts only, so a role change gets its own row.
      if (existing && existing.role !== volunteer.role) {
        await writeAudit(tx, {
          ...audit,
          action: 'user.update',
          entityType: 'Volunteer',
          entityId: volunteer.id,
          before: { role: existing.role },
          after: { role: volunteer.role },
        });
      }
    }

    for (const [index, row] of request.rows.entries()) {
      const rowNumber = index + 1;

      if (row.reportsToEmail) {
        const managerId = byEmail.get(row.reportsToEmail);
        if (managerId === DEACTIVATED) {
          issues.push({
            rowNumber,
            field: 'reportsToEmail',
            message: `${row.reportsToEmail} is deactivated and cannot be a manager`,
          });
        } else if (!managerId) {
          issues.push({
            rowNumber,
            field: 'reportsToEmail',
            message: `No volunteer with email ${row.reportsToEmail} in this file or on the roster`,
          });
        } else {
          const volunteerId = byEmail.get(row.email);
          if (volunteerId) {
            await tx.volunteer.update({
              where: { id: volunteerId },
              data: { reportsToId: managerId },
            });
          }
        }
      }

      // An assignment needs all three of station, date and block. A row with
      // only some of them describes a person, not a shift, and is skipped
      // rather than guessed at.
      const hasAssignment = row.stationCode && row.eventDate && row.block;
      if (!hasAssignment) {
        if (row.stationCode || row.eventDate || row.block) {
          issues.push({
            rowNumber,
            field: 'stationCode/eventDate/block',
            message: 'A shift assignment needs all of stationCode, eventDate and block',
          });
        }
        continue;
      }

      const station = await findStationByCodeTx(tx, row.stationCode as string);
      if (!station) {
        issues.push({
          rowNumber,
          field: 'stationCode',
          message: `Unknown station code ${row.stationCode as string}`,
        });
        continue;
      }

      const eventDay = await findEventDayByDate(tx, eventDayAnchor(row.eventDate as string));
      if (!eventDay) {
        issues.push({
          rowNumber,
          field: 'eventDate',
          message: `${row.eventDate as string} is not a configured event day`,
        });
        continue;
      }

      const volunteerId = byEmail.get(row.email);
      if (!volunteerId || volunteerId === DEACTIVATED) continue;

      const result = await upsertAssignment(tx, {
        volunteerId,
        stationId: station.id,
        eventDayId: eventDay.id,
        block: row.block as NonNullable<typeof row.block>,
        roleLabel: row.roleLabel ?? 'Volunteer',
      });

      if (result.created) counters.assignmentsCreated += 1;
      else counters.assignmentsUpdated += 1;
    }
  };

  if (request.commit) {
    await prisma.$transaction(async (tx) => {
      await apply(tx);
      await writeAudit(tx, {
        ...audit,
        action: 'roster.import',
        entityType: 'Volunteer',
        entityId: null,
        after: { rowCount: request.rows.length, ...counters },
      });
    });

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

  return { committed: request.commit, ...counters, issues };
}

/** Marks a deactivated person in the import's email → id map. */
const DEACTIVATED = 'deactivated';

/**
 * Load every existing account the file names, refusing the whole import if any
 * row would breach the escalation rules. All or nothing: a half-applied roster
 * is worse than none, and the importer fixes the file and re-runs the preview.
 */
async function loadExistingForImport(
  request: RosterImportRequest,
  actor: RosterActor,
): Promise<Map<string, Volunteer>> {
  const existingByEmail = new Map<string, Volunteer>();
  for (const [index, row] of request.rows.entries()) {
    if (!existingByEmail.has(row.email)) {
      const existing = await findVolunteerByEmail(row.email);
      if (existing) existingByEmail.set(row.email, existing);
    }
    const existing = existingByEmail.get(row.email) ?? null;
    assertMayManage(actor, { role: row.role, existing }, `Row ${index + 1}: `);
  }
  return existingByEmail;
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
