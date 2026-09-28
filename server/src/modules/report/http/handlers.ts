import type { Request, Response } from 'express';
import type { ReportExportQuery, ReportQuery } from '@spoh/shared';
import { validatedQuery } from '../../../platform/http/validate.js';
import { toCsv } from '../application/export/toCsv.js';
import { toXlsx } from '../application/export/toXlsx.js';
import { generateReport } from '../application/generateReport.js';

export async function reportSummaryHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await generateReport(validatedQuery<ReportQuery>(req)));
}

export async function exportReportHandler(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ReportExportQuery>(req);
  const report = await generateReport(query);
  const stamp = report.generatedAt.slice(0, 10);

  if (query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="spoh2027-report-${stamp}.csv"`);
    res.status(200).send(toCsv(report));
    return;
  }

  const workbook = await toXlsx(report);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="spoh2027-report-${stamp}.xlsx"`);
  res.status(200).send(workbook);
}
