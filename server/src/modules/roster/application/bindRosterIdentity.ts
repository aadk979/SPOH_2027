import type { RosterImportRow } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { completeAccountOperation } from '../../../platform/identity/accountOperation.js';
import { invalidatePersonCredentials } from '../../auth/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { upsertVolunteer } from '../data/repo.js';
import type { RosterActor } from './context.js';
import { validateRosterIdentity, type RosterIdentity } from './rosterIdentity.js';

/** Called with all actor and target Person locks already held in canonical order. */
export async function bindRosterIdentity(tx: PrismaTransactionClient, input: {
  row: RosterImportRow; actor: RosterActor; identity: RosterIdentity; reportsToId?: string | null;
}) {
  const { row, actor, identity } = input;
  const { current, profile } = await validateRosterIdentity(tx, input);
  const result = await upsertVolunteer(tx, actor.scope, { ...profile, cognitoSub: identity.sub,
    ...(identity.operation ? { id: identity.operation.plannedPersonId } : {}), role: row.role,
    ...(row.portfolio !== undefined ? { portfolio: row.portfolio } : {}),
    ...(input.reportsToId !== undefined ? { reportsToId: input.reportsToId } : {}) });
  if (current && (!current.membershipStatus || current.role !== row.role)) {
    await invalidatePersonCredentials(tx, { personId: result.volunteer.id, reason: 'role-changed', at: systemClock.now() });
    if (current.membershipStatus) await writeAudit(tx, { ...actor.audit, action: 'user.update', entityType: 'Volunteer',
      entityId: result.volunteer.id, before: { role: current.role }, after: { role: row.role } });
  }
  if (identity.operation?.state === 'PROVIDER_READY') await completeAccountOperation(tx, {
    operation: identity.operation, personId: result.volunteer.id, profile, audit: actor.audit });
  return result;
}
