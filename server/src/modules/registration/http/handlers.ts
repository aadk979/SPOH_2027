import type { Request, Response } from 'express';
import type { z } from 'zod';
import type {
  CreateGroupRegistrationRequest,
  CreateRegistrationRequest,
  Id,
  RegistrationSummaryQuery,
  VoidRegistrationRequest,
} from '@spoh/shared';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { captureContextFrom } from '../../../platform/http/captureActor.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { recordGroupRegistration } from '../application/recordGroupRegistration.js';
import { recordRegistration } from '../application/recordRegistration.js';
import { summariseRegistrations } from '../application/summariseRegistrations.js';
import { voidRegistrationById } from '../application/voidRegistrationById.js';

export async function recordRegistrationHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateRegistrationRequest>(req);
  res.status(201).json(await recordRegistration(body, captureContextFrom(req)));
}

export async function recordGroupRegistrationHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateGroupRegistrationRequest>(req);
  res.status(201).json(await recordGroupRegistration(body, captureContextFrom(req)));
}

export async function voidRegistrationHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: z.infer<typeof Id> }>(req);
  const { reason } = validatedBody<VoidRegistrationRequest>(req);
  await voidRegistrationById(id, reason, auditContextFrom(req));
  res.status(204).send();
}

export async function summariseRegistrationsHandler(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<RegistrationSummaryQuery>(req);
  res.status(200).json(await summariseRegistrations(query));
}
