import type { Request, Response } from 'express';
import type { CheckInRequest } from '@spoh/shared';
import { getAuth } from '../../../platform/identity/index.js';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { checkIn } from '../application/checkIn.js';
import { checkOut } from '../application/checkOut.js';
import { getMe } from '../application/getMe.js';

export async function getMeHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await getMe(getAuth(req).volunteerId));
}

export async function checkInHandler(req: Request, res: Response): Promise<void> {
  const { assignmentId } = validatedBody<CheckInRequest>(req);
  res.status(200).json({ assignment: await checkIn(assignmentId, actorContextFrom(req)) });
}

export async function checkOutHandler(req: Request, res: Response): Promise<void> {
  const { assignmentId } = validatedBody<CheckInRequest>(req);
  res.status(200).json({ assignment: await checkOut(assignmentId, actorContextFrom(req)) });
}
