import { ERROR_CODES, type EventContent } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { contentReferenceCounts, draftRow, imageReceipts, lockContentEvent } from '../data/repo.js';
import { contentReferences } from '../domain/contentRules.js';

export type ContentActor = ActorContext & { clock?: Clock };
export async function prepareContentMutation(
  tx: PrismaTransactionClient,
  input: { actor: ContentActor; action: 'Content.Edit' | 'Content.Publish' | 'Schedule.Manage' },
) {
  const { actor } = input;
  const event = await lockContentEvent(actor.scope, tx);
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    action: input.action,
    clock: actor.clock,
  });
  if (event.status === 'ARCHIVED')
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'Archived event content is read-only. Clone the event to start another guide.',
    );
  return { scope: actor.scope, now: (actor.clock ?? systemClock).now() };
}
export async function checkedContentDraft(
  tx: PrismaTransactionClient,
  input: { actor: ContentActor; expectedVersion: number },
) {
  const row = await draftRow(input.actor.scope, tx);
  if (!row || row.version !== input.expectedVersion)
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The content draft changed. Reload and review the latest version.',
    );
  return row;
}
export async function validateContentReferences(
  tx: PrismaTransactionClient,
  input: { actor: ContentActor; body: EventContent },
) {
  const refs = contentReferences(input.body);
  const counts = await contentReferenceCounts(input.actor.scope, { tx, ...refs });
  if (counts.tags !== refs.tags.length || counts.stations !== refs.stations.length)
    throw new NotFoundError('Content station or tag');
  const receipts = await imageReceipts(input.actor.scope, { tx, keys: refs.images });
  if (receipts.length !== refs.images.length) throw new NotFoundError('Content image');
  return receipts;
}
