import type { CreateAnnouncementDraftRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { draftAuditMetadata, draftContent, toDraftRecord } from '../data/draftMapper.js';
import { insertDraft } from '../data/draftRepo.js';
import { prepareDraftMutation, type DraftActor } from './prepareDraftMutation.js';

/** Creation, attribution, audit and id-only replay commit together; no announcement or push. */
export async function createDraft(request: CreateAnnouncementDraftRequest, actor: DraftActor) {
  return prisma.$transaction(
    async (tx) => {
      const { now, scope } = await prepareDraftMutation(tx, { request, actor });
      await lockReserved(tx, scope, request.idempotencyKey);
      const row = await insertDraft(scope, {
        tx,
        authorId: actor.volunteerId,
        authorMembershipId: actor.membershipId,
        data: draftContent(request),
        now,
      });
      await writeAudit(tx, {
        ...actor.audit,
        action: 'announcement.draft.create',
        entityType: 'AnnouncementDraft',
        entityId: row.id,
        after: draftAuditMetadata(row),
      });
      await settleReserved(tx, scope, {
        key: request.idempotencyKey,
        statusCode: 201,
        body: { draftId: row.id },
      });
      return toDraftRecord(row);
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
