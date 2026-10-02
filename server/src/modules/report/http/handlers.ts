import type { Request, Response } from 'express';
import type { ReportExportQuery, ReportQuery } from '@spoh/shared';
import { validatedQuery } from '../../../platform/http/validate.js';
import { sendReportExport } from './exportResponse.js';
import { readReport } from '../application/readReport.js';
import { getAuth, scopeOf } from '../../../platform/http/requireAuth.js';
import { visitorRecordsFor } from '../../visitor/index.js';

export async function reportSummaryHandler(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(await readReport(scopeOf(req), validatedQuery<ReportQuery>(req)));
}

export async function exportReportHandler(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  const query = validatedQuery<ReportExportQuery>(req);
  const report = await readReport(scopeOf(req), query);
  // Visitor values only for a role that reads them, and only as their own sheet (ADR-002 §4).
  const visitors = await visitorRecordsFor(
    { ...scopeOf(req), includeRehearsal: query.includeRehearsal },
    {
      role: getAuth(req).role,
      from: query.from ? new Date(query.from) : new Date(0),
      to: query.to ? new Date(query.to) : new Date(8.64e15),
    },
  );
  const stamp = report.generatedAt.slice(0, 10);
  const fileName = `${report.event.slug}-report-${stamp}${report.snapshot ? '-frozen-final' : ''}${report.rehearsalIncluded ? '-with-rehearsal' : ''}`;

  await sendReportExport(res, { report, visitors, fileName, format: query.format });
}
