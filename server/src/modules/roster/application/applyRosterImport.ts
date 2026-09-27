import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { setManager, upsertAssignment, upsertVolunteer } from '../data/repo.js';
import type { RosterImportPlan } from '../domain/planRosterImport.js';

/** Create or update each person, and audit a role change per person. */
async function applyPeople(
  tx: PrismaTransactionClient,
  plan: RosterImportPlan,
  context: { identities: ReadonlyMap<string, string>; audit: AuditContext },
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const step of plan.people) {
    const { row } = step;
    const { volunteer } = await upsertVolunteer(tx, {
      cognitoSub: context.identities.get(row.email) ?? `pending:${row.email}`,
      displayName: row.displayName,
      email: row.email,
      phone: row.phone ?? null,
      role: row.role,
      portfolio: row.portfolio ?? null,
    });
    ids.set(row.email, volunteer.id);
    // `roster.import` records counts only, so a role change gets its own row.
    if (step.roleChangedFrom) {
      await writeAudit(tx, {
        ...context.audit,
        action: 'user.update',
        entityType: 'Volunteer',
        entityId: volunteer.id,
        before: { role: step.roleChangedFrom },
        after: { role: row.role },
      });
    }
  }
  return ids;
}

/** Apply a plan inside the caller's transaction. */
export async function applyRosterImport(
  tx: PrismaTransactionClient,
  plan: RosterImportPlan,
  context: { identities: ReadonlyMap<string, string>; audit: AuditContext },
): Promise<void> {
  const ids = await applyPeople(tx, plan, context);
  for (const link of plan.links) {
    await setManager(tx, {
      volunteerId: ids.get(link.email) as string,
      managerId: link.managerId ?? (ids.get(link.managerEmail) as string),
    });
  }
  for (const step of plan.assignments) {
    await upsertAssignment(tx, {
      volunteerId: ids.get(step.email) as string,
      stationId: step.stationId,
      eventDayId: step.eventDayId,
      block: step.block,
      roleLabel: step.roleLabel,
    });
  }
}
