import { ERROR_CODES, type EventSummary, type RenameEventRequest } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { findEventSummary, lockEventName, writeEventName } from '../data/repo.js';

/**
 * Rename the caller's event: the name every screen, report and export shows.
 * The event's Chief and Admin (`config.manage`), checked against the current
 * membership after the event lock, never the token. A rename is refused when
 * someone renamed the event since the caller read it, and once it is archived.
 * Repeating a rename that already happened changes nothing and audits nothing.
 */
export async function renameEvent(
  change: RenameEventRequest,
  actor: ActorContext,
): Promise<EventSummary> {
  const { scope } = actor;
  await prisma.$transaction(
    async (tx) => {
      const event = await lockEventName(tx, scope);
      if (!event) throw new NotFoundError('Event');
      await requireCurrentPermission(tx, {
        scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        action: 'Structure.Edit',
      });
      if (event.status === 'ARCHIVED')
        throw new ConflictError(ERROR_CODES.SETTING_LOCKED, 'An archived event cannot be renamed.');
      if (event.name === change.name) return;
      if (event.name !== change.expectedName)
        throw new ConflictError(
          ERROR_CODES.CONFLICT,
          'Someone renamed this event since you opened it. Reload to see the current name.',
          { current: event.name },
        );
      await writeEventName(tx, scope, change.name);
      await writeAudit(tx, {
        ...actor.audit,
        action: 'event.rename',
        entityType: 'Event',
        entityId: scope.eventId,
        before: { name: event.name },
        after: { name: change.name },
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
  return findEventSummary(scope.eventId);
}
