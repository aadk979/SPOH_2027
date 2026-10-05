import type { Request, Response } from 'express';
import { ScopedSettingsMutationResponse, type ScopedSettingsMutationRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { mutateScopedSetting } from '../application/mutateScopedSetting.js';
import { readScopedMutation } from '../application/readScopedMutation.js';
import { ScopedMutationReceipt, toScopedMutationReceipt } from '../domain/scopedMutationReceipt.js';

export const scopedSettingMutationReplay: RedactedReplay = {
  store: (body) => toScopedMutationReceipt(ScopedSettingsMutationResponse.parse(body)),
  async replay(req, stored) {
    const receipt = ScopedMutationReceipt.parse(stored);
    const request = validatedBody<ScopedSettingsMutationRequest>(req);
    return readScopedMutation(receipt, request, actorContextFrom(req));
  },
};
export async function mutateScopedSettingHandler(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(
      await mutateScopedSetting(
        validatedBody<ScopedSettingsMutationRequest>(req),
        actorContextFrom(req),
      ),
    );
}
