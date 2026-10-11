import { z } from 'zod';
import { Id } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { replayBriefing, replaySwap } from '../application/replayMutation.js';

const Receipt = z.object({ id: Id });
const entityReceipt = (body: unknown, field: 'swap' | 'slot') =>
  Receipt.parse(z.object({ [field]: Receipt }).parse(body)[field]);
export const swapMutationReplay: RedactedReplay = {
  store: (body) => entityReceipt(body, 'swap'),
  replay: (req, stored) => replaySwap(Receipt.parse(stored).id, actorContextFrom(req)),
};
export const briefingMutationReplay: RedactedReplay = {
  store: (body) => entityReceipt(body, 'slot'),
  replay: (req, stored) => replayBriefing(Receipt.parse(stored).id, actorContextFrom(req)),
};
