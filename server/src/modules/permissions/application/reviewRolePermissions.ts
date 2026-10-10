import { ERROR_CODES, type ReviewRolePermissionsRequest } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { assertWritableEvent } from '../../../platform/db/writableEvent.js';
import { ConflictError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { lockPermissionEvent, permissionReview, recordPermissionReview } from '../data/repo.js';
import { readRolePermissions } from './readRolePermissions.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';

/** A deliberate review belongs to the exact grants version, after current authority is checked. */
export function reviewRolePermissions(
  request: ReviewRolePermissionsRequest,
  actor: ActorContext & { clock?: Clock },
) {
  return prisma.$transaction(
    async (tx) => {
      const event = await lockPermissionEvent(tx, actor.scope);
      await requireCurrentPermission(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        action: 'Permissions.Edit',
      });
      assertWritableEvent(event);
      const before = await permissionReview(tx, actor.scope);
      if (before.permissionsVersion !== request.expectedVersion) {
        throw new ConflictError(
          ERROR_CODES.CONFLICT,
          'Permissions changed. Reload and review again.',
        );
      }
      await lockReserved(tx, actor.scope, request.idempotencyKey);
      const now = (actor.clock ?? systemClock).now();
      await recordPermissionReview(tx, actor.scope, { version: request.expectedVersion, now });
      await writeAudit(tx, {
        ...actor.audit,
        action: 'permissions.review',
        entityType: 'Event',
        entityId: actor.scope.eventId,
        before: { reviewedVersion: before.permissionsReviewedVersion },
        after: {
          reviewedVersion: request.expectedVersion,
          reviewedAt: now.toISOString(),
          reason: request.reason,
        },
      });
      await settleReserved(tx, actor.scope, {
        key: request.idempotencyKey,
        statusCode: 200,
        body: { reviewed: true },
      });
      return readRolePermissions(actor.scope, { canEdit: true }, tx);
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
