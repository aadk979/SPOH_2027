import type { Request, Response } from 'express';
import type {
  DeactivateVolunteerRequest,
  ListVolunteersQuery,
  UpdateVolunteerRequest,
} from '@spoh/shared';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { getAuth } from '../../../platform/identity/index.js';
import type { ManagerContext } from '../application/context.js';
import { deactivateVolunteer } from '../application/deactivateVolunteer.js';
import { getVolunteer, listVolunteers } from '../application/queries.js';
import { reactivateVolunteer } from '../application/reactivateVolunteer.js';
import { updateVolunteer } from '../application/updateVolunteer.js';

function managerFrom(req: Request): ManagerContext {
  const auth = getAuth(req);
  return { volunteerId: auth.volunteerId, role: auth.role, audit: auditContextFrom(req) };
}

const idOf = (req: Request): string => validatedParams<{ id: string }>(req).id;

export async function listVolunteersHandler(req: Request, res: Response): Promise<void> {
  const { data, nextCursor } = await listVolunteers(validatedQuery<ListVolunteersQuery>(req));
  res.status(200).json({ data, meta: { count: data.length, nextCursor } });
}

export async function getVolunteerHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({ volunteer: await getVolunteer(idOf(req)) });
}

export async function updateVolunteerHandler(req: Request, res: Response): Promise<void> {
  const patch = validatedBody<UpdateVolunteerRequest>(req);
  res.status(200).json(await updateVolunteer(idOf(req), patch, managerFrom(req)));
}

export async function deactivateVolunteerHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<DeactivateVolunteerRequest>(req);
  res.status(200).json(await deactivateVolunteer(idOf(req), body, managerFrom(req)));
}

export async function reactivateVolunteerHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await reactivateVolunteer(idOf(req), managerFrom(req)));
}
