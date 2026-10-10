import { z } from 'zod';
import { ContentImageResponse, type CreateContentImageRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { replayContentImageUpload } from '../application/createImageUpload.js';

const receipt = z.object({ key: z.string().min(1) }).strict();
export const contentImageReplay: RedactedReplay = {
  store(body) {
    return { key: z.object({ data: ContentImageResponse }).parse(body).data.key };
  },
  replay(req, stored) {
    return replayContentImageUpload({
      ...receipt.parse(stored),
      request: validatedBody<CreateContentImageRequest>(req),
      actor: actorContextFrom(req),
    });
  },
};
