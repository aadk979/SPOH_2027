import type { ReviewContentRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { toContentDraft } from '../data/mappers.js';
import { reviewDraftRow } from '../data/repo.js';
import { checkedContentDraft, prepareContentMutation, type ContentActor } from './prepare.js';

export function reviewContentDraft(request: ReviewContentRequest, actor: ContentActor) {
  return prisma.$transaction(async (tx) => {
    const { scope, now } = await prepareContentMutation(tx, { actor, action: 'Content.Publish' });
    await lockReserved(tx, scope, request.idempotencyKey);
    const draft = await checkedContentDraft(tx, {
      actor,
      expectedVersion: request.expectedVersion,
    });
    const row = await reviewDraftRow(scope, {
      tx,
      personId: actor.volunteerId,
      now,
      version: draft.version,
    });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'content.draft.review',
      entityType: 'ContentDocument',
      entityId: row.id,
      after: { version: row.version },
    });
    const response = { data: toContentDraft(scope.eventId, row) };
    await settleReserved(tx, scope, {
      key: request.idempotencyKey,
      statusCode: 200,
      body: response,
    });
    return response;
  });
}
