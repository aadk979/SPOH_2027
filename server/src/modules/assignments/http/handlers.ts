import type { Request, Response } from 'express';
import type { CreateAssignmentRequest } from '@spoh/shared';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { getAuth } from '../../../platform/identity/index.js';
import { createAssignment } from '../application/createAssignment.js';
import { deleteAssignment } from '../application/deleteAssignment.js';
import { getStationRoster } from '../application/getStationRoster.js';

export async function createAssignmentHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateAssignmentRequest>(req);
  res.status(201).json({ assignment: await createAssignment(body, auditContextFrom(req)) });
}

export async function deleteAssignmentHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  await deleteAssignment(id, auditContextFrom(req));
  res.status(204).end();
}

export async function stationRosterHandler(req: Request, res: Response): Promise<void> {
  const { stationId } = validatedParams<{ stationId: string }>(req);
  const { eventDayId } = validatedQuery<{ eventDayId?: string }>(req);
  const auth = getAuth(req);
  const roster = await getStationRoster(
    { stationId, eventDayId },
    { volunteerId: auth.volunteerId, role: auth.role },
  );
  res.status(200).json({ data: roster, meta: { count: roster.length, nextCursor: null } });
}
