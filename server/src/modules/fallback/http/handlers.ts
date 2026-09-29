import type { Request, Response } from 'express';
import type {
  CloseFallbackRequest,
  DeclareFallbackRequest,
  ImportFootfallRequest,
  ImportRegistrationsRequest,
  TimeRangeQuery,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { closeFallback } from '../application/closeFallback.js';
import { declareFallback } from '../application/declareFallback.js';
import { importFootfall } from '../application/importFootfall.js';
import { importRegistrations } from '../application/importRegistrations.js';
import { listFallbackWindows } from '../application/listFallbackWindows.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';

export async function declareWindowHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<DeclareFallbackRequest>(req);
  const window = await declareFallback(body, actorContextFrom(req));
  res.status(201).json({ window });
}

export async function closeWindowHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const body = validatedBody<CloseFallbackRequest>(req);
  res.status(200).json({ window: await closeFallback(id, body, actorContextFrom(req)) });
}

export async function listWindowsHandler(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<TimeRangeQuery>(req);
  const windows = await listFallbackWindows(scopeOf(req), {
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
  });
  res.status(200).json({ data: windows, meta: { count: windows.length, nextCursor: null } });
}

export async function importRegistrationsHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<ImportRegistrationsRequest>(req);
  const result = await importRegistrations(body, actorContextFrom(req));
  res.status(result.committed ? 201 : 200).json(result);
}

export async function importFootfallHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<ImportFootfallRequest>(req);
  const result = await importFootfall(body, actorContextFrom(req));
  res.status(result.committed ? 201 : 200).json(result);
}
