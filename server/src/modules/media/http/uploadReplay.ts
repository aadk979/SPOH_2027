import { CreateUploadResponse, type CreateUploadRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { replayUpload } from '../application/replayUpload.js';
import { MediaUploadReceipt } from '../domain/uploadReceipt.js';

/** Signed credentials stay transient; replay reconstructs them after current authorization. */
export const mediaUploadReplay: RedactedReplay = {
  store(body) {
    return { key: CreateUploadResponse.parse(body).key };
  },
  replay(req, stored) {
    const { key } = MediaUploadReceipt.parse(stored);
    return replayUpload({
      key,
      request: validatedBody<CreateUploadRequest>(req),
      actor: actorContextFrom(req),
    });
  },
};
