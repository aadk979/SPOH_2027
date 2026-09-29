import type { Request, Response } from 'express';
import type {
  CreateIncidentFollowUpRequest,
  CreateIncidentRequest,
  ListIncidentsQuery,
  UpdateIncidentStatusRequest,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { appendFollowUp } from '../application/appendFollowUp.js';
import { changeIncidentStatus } from '../application/changeIncidentStatus.js';
import { listIncidentRecords } from '../application/listIncidentRecords.js';
import { reportIncident } from '../application/reportIncident.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';

const idOf = (req: Request): string => validatedParams<{ id: string }>(req).id;

export async function reportIncidentHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateIncidentRequest>(req);
  res.status(201).json({ incident: await reportIncident(body, actorContextFrom(req)) });
}

export async function listIncidentsHandler(req: Request, res: Response): Promise<void> {
  const page = await listIncidentRecords(scopeOf(req), validatedQuery<ListIncidentsQuery>(req));
  res.status(200).json({
    data: page.data,
    meta: { count: page.data.length, nextCursor: page.nextCursor },
  });
}

export async function appendFollowUpHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateIncidentFollowUpRequest>(req);
  const incident = await appendFollowUp(idOf(req), body, actorContextFrom(req));
  res.status(201).json({ incident });
}

export async function changeIncidentStatusHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<UpdateIncidentStatusRequest>(req);
  const incident = await changeIncidentStatus(idOf(req), body, actorContextFrom(req));
  res.status(200).json({ incident });
}
