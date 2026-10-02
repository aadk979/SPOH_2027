import type { Request, Response } from 'express';
import type {
  ReportSnapshotExportQuery,
  ReportSnapshotParams,
  ReportSnapshotsQuery,
} from '@spoh/shared';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { listSnapshots } from '../application/listSnapshots.js';
import { readSnapshot } from '../application/readSnapshot.js';
import { sendReportExport } from './exportResponse.js';

export async function listSnapshotsHandler(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res
    .status(200)
    .json(await listSnapshots(scopeOf(req), validatedQuery<ReportSnapshotsQuery>(req)));
}

export async function readSnapshotHandler(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  const { id } = validatedParams<ReportSnapshotParams>(req);
  res.status(200).json(await readSnapshot(scopeOf(req), id));
}

export async function exportSnapshotHandler(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  const { id } = validatedParams<ReportSnapshotParams>(req);
  const { format } = validatedQuery<ReportSnapshotExportQuery>(req);
  const report = await readSnapshot(scopeOf(req), id);
  const kind = report.snapshot!.kind.toLowerCase();
  const stamp = report.generatedAt.slice(0, 10);
  const fileName = `${report.event.slug}-report-${stamp}-frozen-${kind}-${id}${report.snapshot!.supersededAt ? '-superseded' : ''}${report.rehearsalIncluded ? '-with-rehearsal' : ''}`;
  // Stored snapshots exclude visitor values; exports contain only that immutable document.
  await sendReportExport(res, { report, format, fileName });
}
