import type { Request, Response } from 'express';
import type { z } from 'zod';
import { validatedQuery } from '../../../platform/http/validate.js';
import { listAuditLog } from '../application/listAuditLog.js';
import type { AuditQuery } from './routes.js';

export async function listAuditLogHandler(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<z.infer<typeof AuditQuery>>(req);
  const page = await listAuditLog(query);
  res
    .status(200)
    .json({ data: page.data, meta: { count: page.data.length, nextCursor: page.nextCursor } });
}
