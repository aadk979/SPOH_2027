import { ERROR_CODES, type UpdateAnnouncementDraftRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import {
  draftAuditMetadata,
  draftContent,
  draftContentMatches,
  toDraftRecord,
} from '../data/draftMapper.js';
import { findOwnDraft, replaceDraft } from '../data/draftRepo.js';
import { prepareDraftMutation, type DraftActor } from './prepareDraftMutation.js';

export async function updateDraft(
  input: { id: string; request: UpdateAnnouncementDraftRequest },
  actor: DraftActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const { now, scope } = await prepareDraftMutation(tx, { request: input.request, actor });
      const row = await findOwnDraft(scope, { id: input.id, authorId: actor.volunteerId }, tx);
      if (!row) throw new NotFoundError('Announcement draft');
      if (row.version !== input.request.expectedVersion) {
        throw new ConflictError(
          ERROR_CODES.CONFLICT,
          'The draft changed. Reload before editing again.',
        );
      }
      const data = draftContent(input.request);
      if (draftContentMatches(row, data)) return toDraftRecord(row);
      const updated = await replaceDraft(scope, {
        tx,
        id: row.id,
        expectedVersion: row.version,
        data,
        now,
      });
      await writeAudit(tx, {
        ...actor.audit,
        action: 'announcement.draft.update',
        entityType: 'AnnouncementDraft',
        entityId: row.id,
        before: draftAuditMetadata(row),
        after: {
          ...draftAuditMetadata(updated),
          // Unpublished text is not copied into indefinitely retained audit history.
          bodyChanged: row.body !== updated.body,
          ...(input.request.reason ? { reason: input.request.reason } : {}),
        },
      });
      return toDraftRecord(updated);
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
