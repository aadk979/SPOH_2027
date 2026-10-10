import { z } from 'zod';
import { Id, IdempotencyKey, IsoDateTime } from '../common/index.js';

export const CreateArchiveExportRequest = z.object({ idempotencyKey: IdempotencyKey }).strict();
export type CreateArchiveExportRequest = z.infer<typeof CreateArchiveExportRequest>;
export const ArchiveExportParams = z.object({ id: Id }).strict();
export type ArchiveExportParams = z.infer<typeof ArchiveExportParams>;
export const ArchiveExportRecord = z
  .object({
    id: Id,
    eventId: Id,
    snapshotId: Id,
    objectKey: z.string(),
    createdAt: IsoDateTime,
    downloadPath: z.string(),
  })
  .strict();
export type ArchiveExportRecord = z.infer<typeof ArchiveExportRecord>;
export const ArchiveExportResponse = z.object({ data: ArchiveExportRecord }).strict();
export type ArchiveExportResponse = z.infer<typeof ArchiveExportResponse>;
