import { z } from 'zod';
import { Id } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { readOwnDraft } from '../application/readDrafts.js';

/** Rebuild from current private content instead of retaining a second text copy in replay. */
export const draftReplay: RedactedReplay = {
  store(body) {
    const { draft } = z.object({ draft: z.object({ id: Id }) }).parse(body);
    return { draftId: draft.id };
  },
  async replay(req, stored) {
    const { draftId } = z.object({ draftId: Id }).strict().parse(stored);
    return { draft: await readOwnDraft(draftId, actorContextFrom(req)) };
  },
};
