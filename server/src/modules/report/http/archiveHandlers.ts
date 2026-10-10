import type { Request, Response } from 'express';
import type { ArchiveExportParams, CreateArchiveExportRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import {
  createArchiveExport,
  listArchiveExports,
  readArchiveExport,
} from '../application/archiveExport.js';
import { ARCHIVE_WORKBOOK_TYPE } from '../application/archiveStorage.js';

export async function createArchiveExportHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  res
    .status(201)
    .json(
      await createArchiveExport(
        validatedBody<CreateArchiveExportRequest>(req),
        actorContextFrom(req),
      ),
    );
}
export async function readArchiveExportHandler(req: Request, res: Response) {
  const exported = await readArchiveExport(
    scopeOf(req),
    validatedParams<ArchiveExportParams>(req).id,
  );
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', `attachment; filename="${exported.fileName}"`);
  res.type(ARCHIVE_WORKBOOK_TYPE).send(Buffer.from(exported.body));
}
export async function listArchiveExportsHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await listArchiveExports(scopeOf(req)));
}
