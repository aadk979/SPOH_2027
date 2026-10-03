import { z } from 'zod';
import { Id } from '@spoh/shared';
import { IdempotencyKeyReuseError } from '../../../platform/errors/index.js';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { validatedParams } from '../../../platform/http/validate.js';
import { readPublicationSchedule } from '../application/readPublicationSchedule.js';

/** Retain ids only; rebuild current status, and reject reusing a key against another draft. */
export const publicationScheduleReplay: RedactedReplay = {
  store(body) {
    const { schedule } = z.object({ schedule: z.object({ id: Id, draftId: Id }) }).parse(body);
    return { scheduledActionId: schedule.id, draftId: schedule.draftId };
  },
  async replay(req, stored) {
    const { scheduledActionId, draftId } = z
      .object({ scheduledActionId: Id, draftId: Id })
      .strict()
      .parse(stored);
    const { id } = validatedParams<{ id: string }>(req);
    if (id !== draftId) throw new IdempotencyKeyReuseError();
    return {
      schedule: await readPublicationSchedule(
        { id, scheduleId: scheduledActionId },
        actorContextFrom(req),
      ),
    };
  },
};
