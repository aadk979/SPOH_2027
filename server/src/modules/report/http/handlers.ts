import type { Request, Response } from 'express';
import type { ReportExportQuery, ReportQuery } from '@spoh/shared';
import { validatedQuery } from '../../../platform/http/validate.js';
import { toCsv } from '../application/export/toCsv.js';
import { toXlsx } from '../application/export/toXlsx.js';
import { generateReport } from '../application/generateReport.js';
import { getAuth, scopeOf } from '../../../platform/http/requireAuth.js';
import { visitorRecordsFor } from '../../visitor/index.js';

export async function reportSummaryHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await generateReport(scopeOf(req), validatedQuery<ReportQuery>(req)));
}

export async function exportReportHandler(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  const query = validatedQuery<ReportExportQuery>(req);
  const report = await generateReport(scopeOf(req), query);
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
  const fileName = `${report.event.slug}-report-${stamp}${report.rehearsalIncluded ? '-with-rehearsal' : ''}`;

  if (query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
    res.status(200).send(toCsv(report, visitors));
    return;
  }

  const workbook = await toXlsx(report, visitors);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);
  res.status(200).send(workbook);
}
