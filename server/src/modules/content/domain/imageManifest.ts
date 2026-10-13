import { z } from 'zod';
import { UploadContentType } from '@spoh/shared';

export const imageManifestEntry = z.object({
  schemaVersion: z.literal(1), key: z.string(), contentType: UploadContentType,
  contentLength: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceEtag: z.string(), sourceVersionId: z.string().nullable(), objectVersionId: z.string().nullable(),
}).strict();
export type ImageManifestEntry = z.infer<typeof imageManifestEntry>;
export const imageManifest = z.array(imageManifestEntry);
