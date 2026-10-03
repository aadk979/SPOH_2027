import type { Request, Response } from 'express';
import { RevertEventSettingResponse, type RevertEventSettingRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { IdempotencyKeyReuseError } from '../../../platform/errors/index.js';
import { revertEventSetting } from '../application/revertEventSetting.js';
import { readProductRevert } from '../application/readProductRevert.js';
import { EventSettingRevertReceipt, toRevertReceipt } from '../domain/revertReceipt.js';

export const eventSettingRevertReplay: RedactedReplay = {
  store: (body) => toRevertReceipt(RevertEventSettingResponse.parse(body)),
  async replay(req, stored) {
    const receipt = EventSettingRevertReceipt.parse(stored);
    const request = validatedBody<RevertEventSettingRequest>(req);
    if (
      receipt.targetHistoryId !== request.historyId ||
      receipt.key !== request.key ||
      receipt.expectedVersion !== request.expectedVersion
    )
      throw new IdempotencyKeyReuseError();
    return readProductRevert(receipt, actorContextFrom(req));
  },
};
export async function revertEventSettingHandler(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(
      await revertEventSetting(
        validatedBody<RevertEventSettingRequest>(req),
        actorContextFrom(req),
      ),
    );
}
