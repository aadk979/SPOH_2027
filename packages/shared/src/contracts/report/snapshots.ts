import { z } from 'zod';
import { collection, Id, IsoDateTime, PaginationQuery } from '../common/index.js';
import { ReportSnapshotKind } from '../../invariants/enums.js';

export const ReportRange = z
  .object({ from: IsoDateTime.nullable(), to: IsoDateTime.nullable() })
  .strict();

export const ReportSnapshotMetadata = z
  .object({
    id: Id,
    kind: ReportSnapshotKind,
    lifecycleVersion: z.number().int().nonnegative(),
    createdAt: IsoDateTime,
    supersededAt: IsoDateTime.nullable().optional(),
  })
  .strict();
export type ReportSnapshotMetadata = z.infer<typeof ReportSnapshotMetadata>;

export const ReportSnapshotSummary = ReportSnapshotMetadata.extend({
  rehearsalIncluded: z.boolean(),
  range: ReportRange,
  supersededAt: IsoDateTime.nullable(),
}).strict();
export type ReportSnapshotSummary = z.infer<typeof ReportSnapshotSummary>;
export const ReportSnapshotsResponse = collection(ReportSnapshotSummary);
export type ReportSnapshotsResponse = z.infer<typeof ReportSnapshotsResponse>;

export const ReportSnapshotsQuery = PaginationQuery.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  kind: ReportSnapshotKind.optional(),
}).strict();
export type ReportSnapshotsQuery = z.infer<typeof ReportSnapshotsQuery>;

export const ReportSnapshotParams = z.object({ id: Id }).strict();
export type ReportSnapshotParams = z.infer<typeof ReportSnapshotParams>;
export const ReportSnapshotReadQuery = z.object({}).strict();
export const ReportSnapshotExportQuery = z
  .object({ format: z.enum(['csv', 'xlsx']).default('xlsx') })
  .strict();
export type ReportSnapshotExportQuery = z.infer<typeof ReportSnapshotExportQuery>;
