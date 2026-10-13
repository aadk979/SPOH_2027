import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { setManager, upsertAssignment, findVolunteerByEmail } from '../data/repo.js';
import type { RosterImportPlan } from '../domain/planRosterImport.js';
import { queueAssignmentNotice } from '../../assignments/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import type { RosterActor } from './context.js';
import type { RosterIdentity } from './rosterIdentity.js';
import { bindRosterIdentity } from './bindRosterIdentity.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { requireReportingLine } from '../../../platform/db/reportingLine.js';

interface RosterImportContext {
  identities: ReadonlyMap<string, RosterIdentity>;
  scope: EventScope;
  actor: RosterActor;
  clock?: Clock;
}
async function assertCurrentManager(tx: PrismaTransactionClient, input: { scope: EventScope; email: string; id: string }) {
  const manager = await findVolunteerByEmail(input.scope, input.email, tx);
  if (!manager || manager.id !== input.id || !['ACTIVE', 'INVITED'].includes(manager.membershipStatus ?? ''))
    throw new ValidationError('A manager changed. Preview the import again.');
}

/** Create or update each person, and audit a role change per person. */
async function applyPeople(
  tx: PrismaTransactionClient,
  plan: RosterImportPlan,
  context: RosterImportContext,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const step of plan.people) {
    const { row } = step;
    if (ids.has(row.email)) continue;
    const identity = context.identities.get(row.email);
    if (!identity) throw new ValidationError('The account plan is incomplete. Preview the import again.');
    const { volunteer } = await bindRosterIdentity(tx, { row, actor: context.actor, identity });
    ids.set(row.email, volunteer.id);
  }
  return ids;
}

/** Apply a plan inside the caller's transaction. */
export async function applyRosterImport(
  tx: PrismaTransactionClient,
  plan: RosterImportPlan,
  context: RosterImportContext,
): Promise<void> {
  const ids = await applyPeople(tx, plan, context);
  for (const link of plan.links) {
    if (link.managerId) {
      await assertCurrentManager(tx, { scope: context.scope, email: link.managerEmail, id: link.managerId });
    }
    const relation = {
      volunteerId: ids.get(link.email) as string,
      managerId: link.managerId ?? (ids.get(link.managerEmail) as string),
    };
    await requireReportingLine(tx, context.scope, { personId: relation.volunteerId, managerId: relation.managerId });
    await setManager(tx, context.scope, relation);
  }
  for (const step of plan.assignments) {
    const target = {
      volunteerId: ids.get(step.email) as string,
      stationId: step.stationId,
      eventDayId: step.eventDayId,
      shiftId: step.shiftId,
      roleLabel: step.roleLabel,
    };
    const result = await upsertAssignment(tx, context.scope, target);
    if (result.changed) await queueAssignmentNotice(tx, context.scope, { ...target, id: result.id,
      operation: result.created ? 'ADDED' : 'MOVED', now: (context.clock ?? systemClock).now() });
  }
}
