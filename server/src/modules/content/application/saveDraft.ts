import { ERROR_CODES, type SaveContentDraftRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { toContentDraft } from '../data/mappers.js';
import { draftRow, saveDraftRow } from '../data/repo.js';
import { prepareContentMutation, validateContentReferences, type ContentActor } from './prepare.js';

export function saveContentDraft(request: SaveContentDraftRequest, actor: ContentActor) {
  return prisma.$transaction(
    async (tx) => {
      const { scope, now } = await prepareContentMutation(tx, { actor, action: 'Content.Edit' });
      await lockReserved(tx, scope, request.idempotencyKey);
      const previous = await draftRow(scope, tx);
      if ((previous?.version ?? 0) !== request.expectedVersion)
        throw new ConflictError(ERROR_CODES.CONFLICT, 'The draft changed. Reload before saving.');
      await validateContentReferences(tx, { actor, body: request.body });
      const row = await saveDraftRow(scope, {
        tx,
        body: request.body,
        personId: actor.volunteerId,
        now,
        version: previous?.version ?? 0,
      });
      await writeAudit(tx, {
        ...actor.audit,
        action: 'content.draft.save',
        entityType: 'ContentDocument',
        entityId: row.id,
        before: previous ? { version: previous.version } : undefined,
        after: { version: row.version, reviewInvalidated: true },
      });
      const response = { data: toContentDraft(scope.eventId, row) };
      await settleReserved(tx, scope, {
        key: request.idempotencyKey,
        statusCode: 200,
        body: response,
      });
      return response;
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
