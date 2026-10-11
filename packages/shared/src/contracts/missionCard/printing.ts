import { z } from 'zod';
import { Id, IdempotencyKey, IsoDateTime, PaginationQuery, collection } from '../common/index.js';
import { CardShortCode } from './index.js';

export const PrintCardBatchRequest = z
  .object({
    idempotencyKey: IdempotencyKey,
    shortCodes: z
      .array(CardShortCode)
      .min(1)
      .max(5000)
      .refine((codes) => new Set(codes).size === codes.length, 'Choose each card only once'),
    format: z.enum(['pdf', 'zip']),
  })
  .strict();
export type PrintCardBatchRequest = z.infer<typeof PrintCardBatchRequest>;
export const CardPrintExportRecord = z
  .object({
    id: Id,
    format: z.enum(['pdf', 'zip']),
    count: z.number().int().positive(),
    rehearsal: z.boolean(),
    createdAt: IsoDateTime,
  })
  .strict();
export type CardPrintExportRecord = z.infer<typeof CardPrintExportRecord>;
export const CardPrintExportParams = z.object({ id: Id }).strict();
export type CardPrintExportParams = z.infer<typeof CardPrintExportParams>;

export const CardPrintExportListQuery = PaginationQuery;
export type CardPrintExportListQuery = z.infer<typeof CardPrintExportListQuery>;
export const CardPrintExportListResponse = collection(CardPrintExportRecord);
export type CardPrintExportListResponse = z.infer<typeof CardPrintExportListResponse>;

/** Historical labels belong to the export; later structure edits cannot rewrite them. */
export const CardPrintContextRecord = z
  .object({
    eventName: z.string().min(1),
    stampingStations: z.array(z.object({ id: Id, name: z.string().min(1) }).strict()),
    batches: z.array(
      z.object({ shortCode: CardShortCode, batchLabel: z.string().nullable() }).strict(),
    ),
  })
  .strict();
export type CardPrintContextRecord = z.infer<typeof CardPrintContextRecord>;
export const CardPrintExportDetail = CardPrintExportRecord.extend({
  shortCodes: z.array(CardShortCode).max(5000),
  // Older exports have no frozen context; never invent it from today's configuration.
  printContext: CardPrintContextRecord.nullable(),
}).strict();
export type CardPrintExportDetail = z.infer<typeof CardPrintExportDetail>;
export const CardPrintExportDetailResponse = z.object({ data: CardPrintExportDetail }).strict();
export type CardPrintExportDetailResponse = z.infer<typeof CardPrintExportDetailResponse>;
