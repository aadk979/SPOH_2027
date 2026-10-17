import type { Request, Response } from 'express';
import type { CheckInRequest } from '@spoh/shared';
import { getAuth, scopeOf } from '../../../platform/http/requireAuth.js';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { checkIn } from '../application/checkIn.js';
import { checkOut } from '../application/checkOut.js';
import { getMe } from '../application/getMe.js';

export async function getMeHandler(req: Request, res: Response): Promise<void> {
  const body = await getMe(scopeOf(req), getAuth(req).volunteerId);
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json(body);
}

export async function checkInHandler(req: Request, res: Response): Promise<void> {
  const { assignmentId } = validatedBody<CheckInRequest>(req);
  res.status(200).json({ assignment: await checkIn(assignmentId, actorContextFrom(req)) });
}

export async function checkOutHandler(req: Request, res: Response): Promise<void> {
  const { assignmentId } = validatedBody<CheckInRequest>(req);
  res.status(200).json({ assignment: await checkOut(assignmentId, actorContextFrom(req)) });
}
