import type { Response } from 'express';
import type { FullReport, VisitorRecordsResponse } from '@spoh/shared';
import { toCsv } from '../application/export/toCsv.js';
import { toXlsx } from '../application/export/toXlsx.js';

export async function sendReportExport(
  res: Response,
  input: {
    report: FullReport;
    format: 'csv' | 'xlsx';
    fileName: string;
    visitors?: VisitorRecordsResponse | null;
  },
): Promise<void> {
  res.setHeader('Content-Disposition', `attachment; filename="${input.fileName}.${input.format}"`);
  if (input.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.status(200).send(toCsv(input.report, input.visitors));
    return;
  }
  const workbook = await toXlsx(input.report, input.visitors);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.status(200).send(workbook);
}
