import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import { ERROR_CODES, type CreateGroupRegistrationRequest } from '@spoh/shared';
import type { admitCapture } from '../../../platform/db/captureAdmission.js';
import { findCategory } from '../data/repo.js';

type CategoryAdmission = Pick<Awaited<ReturnType<typeof admitCapture>>, 'lateSync'>;

/**
 * The event's category for the code a capture names (ADR-002): a code the
 * event does not have is a category that does not exist, as for a station.
 */
export async function requireCategory(
  db: PrismaTransactionClient,
  scope: EventScope,
  input: { code: string; admission: CategoryAdmission },
): Promise<{ id: string; code: string; label: string }> {
  const category = await findCategory(db, scope, input.code);
  if (!category) throw new NotFoundError('Category');
  // The supplied admission has already validated CLOSED's pre-close receipt grace.
  if (!category.active && !input.admission.lateSync) {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Capture is paused for this category.');
  }
  return category;
}

/** The categories a group names, by code; any code the event lacks is a 404. */
export async function requireCategories(
  db: PrismaTransactionClient,
  scope: EventScope,
  input: { codes: readonly string[]; admission: CategoryAdmission },
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  // Sequential: parallel queries overlap on a transaction's connection (F03-019).
  for (const code of new Set(input.codes)) {
    const category = await requireCategory(db, scope, { code, admission: input.admission });
    ids.set(code, category.id);
  }
  return ids;
}

/** Group input resolution stays beside the single-category admission rule. */
export function requireGroupCategories(
  db: PrismaTransactionClient,
  scope: EventScope,
  input: { request: Pick<CreateGroupRegistrationRequest, 'members'>; admission: CategoryAdmission },
) {
  return requireCategories(db, scope, {
    codes: input.request.members.map((member) => member.category),
    admission: input.admission,
  });
}
