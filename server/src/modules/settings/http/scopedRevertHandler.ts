import type { Request, Response } from 'express';
import { ScopedSettingsRevertResponse, type ScopedSettingsRevertRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { revertScopedSetting } from '../application/revertScopedSetting.js';
import { readScopedRevert } from '../application/readScopedRevert.js';
import { ScopedRevertReceipt, toScopedRevertReceipt } from '../domain/scopedRevertReceipt.js';

export const scopedSettingRevertReplay: RedactedReplay = {
  store: (body) => toScopedRevertReceipt(ScopedSettingsRevertResponse.parse(body)),
  async replay(req, stored) {
    return readScopedRevert(
      ScopedRevertReceipt.parse(stored),
      validatedBody<ScopedSettingsRevertRequest>(req),
      actorContextFrom(req),
    );
  },
};
export async function revertScopedSettingHandler(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(
      await revertScopedSetting(
        validatedBody<ScopedSettingsRevertRequest>(req),
        actorContextFrom(req),
      ),
    );
}
