import type { ScheduleContentRequest } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { insertContentSchedule } from '../data/repo.js';
import { checkedContentDraft, prepareContentMutation, type ContentActor } from './prepare.js';

export function scheduleContentPublication(request: ScheduleContentRequest, actor: ContentActor) {
  return prisma.$transaction(async (tx) => {
    const { scope, now } = await prepareContentMutation(tx, { actor, action: 'Content.Publish' });
    await requireCurrentPermission(tx, {
      scope,
      membershipId: actor.membershipId,
      personId: actor.volunteerId,
      action: 'Schedule.Manage',
      clock: actor.clock,
    });
    await lockReserved(tx, scope, request.idempotencyKey);
    const draft = await checkedContentDraft(tx, {
      actor,
      expectedVersion: request.expectedVersion,
    });
    const runAt = new Date(request.runAt);
    if (runAt.getTime() <= now.getTime())
      throw new ValidationError('Choose a future publication time.');
    if (draft.reviewedVersion !== draft.version)
      throw new ValidationError('Review this draft version before scheduling it.');
    const row = await insertContentSchedule(scope, {
      tx,
      version: draft.version,
      personId: actor.volunteerId,
      runAt,
      now,
    });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'content.schedule',
      entityType: 'ScheduledAction',
      entityId: row.id,
      after: { draftVersion: draft.version, runAt: runAt.toISOString() },
    });
    const response = {
      data: { id: row.id, runAt: row.runAt.toISOString(), expectedVersion: draft.version },
    };
    await settleReserved(tx, scope, {
      key: request.idempotencyKey,
      statusCode: 201,
      body: response,
    });
    return response;
  });
}
