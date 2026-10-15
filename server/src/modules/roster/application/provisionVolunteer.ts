import type { ProvisionVolunteerRequest, ProvisionVolunteerResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { ValidationError } from '../../../platform/errors/index.js';
import {
  invalidateSessionCache,
  invalidateVolunteerCache,
} from '../../../platform/identity/index.js';
import { toVolunteerRecord } from '../data/mappers.js';
import { findVolunteerByEmail } from '../data/repo.js';
import { holdRosterPeople } from '../data/identityStandingRepo.js';
import type { RosterActor } from './context.js';
import { prepareRosterIdentity } from './rosterIdentity.js';
import { bindRosterIdentity } from './bindRosterIdentity.js';
import { inviteRosterIdentity } from './inviteRosterIdentity.js';
import { holdReportingEvent, requireReportingLine } from '../../../platform/db/reportingLine.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';

async function currentManager(tx: PrismaTransactionClient, actor: RosterActor, email?: string) {
  if (!email) return null;
  const manager = await findVolunteerByEmail(actor.scope, email, tx);
  if (!manager || !['ACTIVE', 'INVITED'].includes(manager.membershipStatus ?? ''))
    throw new ValidationError('The manager named in reportsToEmail is not on the active roster', {
      field: 'reportsToEmail',
    });
  return manager;
}

/** Suppressed creation, atomic binding and durable invitation delivery are separate stages. */
export async function provisionVolunteer(
  request: ProvisionVolunteerRequest,
  actor: RosterActor,
): Promise<ProvisionVolunteerResponse> {
  const identity = await prepareRosterIdentity(request, actor);
  const result = await prisma.$transaction(async (tx) => {
    if (request.reportsToEmail) await holdReportingEvent(tx, actor.scope);
    await holdCaptureEvent(tx, actor.scope);
    await holdRosterPeople(tx, {
      scope: actor.scope,
      actorId: actor.volunteerId,
      emails: [request.email, ...(request.reportsToEmail ? [request.reportsToEmail] : [])],
    });
    const manager = await currentManager(tx, actor, request.reportsToEmail);
    const { volunteer } = await bindRosterIdentity(tx, {
      row: request,
      actor,
      identity,
      reportsToId: manager?.id ?? null,
    });
    if (manager)
      await requireReportingLine(tx, actor.scope, {
        personId: volunteer.id,
        managerId: manager.id,
      });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'user.provision',
      entityType: 'Volunteer',
      entityId: volunteer.id,
      after: { personId: volunteer.id, role: volunteer.role, active: volunteer.active },
    });
    return volunteer;
  });
  invalidateVolunteerCache(identity.sub);
  // Role changes revoke credentials in the transaction; a warm local session must
  // observe that commit before the asynchronous cache notification arrives.
  invalidateSessionCache();
  await inviteRosterIdentity({ row: request, actor, identity });
  return { volunteer: toVolunteerRecord(result), identityCreated: identity.created };
}
