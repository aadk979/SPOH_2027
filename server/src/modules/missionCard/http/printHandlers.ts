import type { Request, Response } from 'express';
import type {
  CardPrintExportListQuery,
  CardPrintExportParams,
  PrintCardBatchRequest,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { downloadCardPrint, printCardBatch } from '../application/printBatch.js';
import { listPrintHistory, readPrintExport } from '../application/readPrintHistory.js';

export async function printHistoryHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await listPrintHistory(scopeOf(req), validatedQuery<CardPrintExportListQuery>(req)));
}
export async function printDetailHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await readPrintExport(scopeOf(req), validatedParams<CardPrintExportParams>(req).id));
}

export async function printBatchHandler(req: Request, res: Response) {
  res
    .status(201)
    .json(await printCardBatch(validatedBody<PrintCardBatchRequest>(req), actorContextFrom(req)));
}
export async function downloadPrintHandler(req: Request, res: Response) {
  const result = await downloadCardPrint(
    scopeOf(req),
    validatedParams<CardPrintExportParams>(req).id,
  );
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(Buffer.from(result.body));
}
