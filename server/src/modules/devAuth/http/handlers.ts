import type { Request, Response } from 'express';
import type { CommitteeRole } from '@spoh/shared';
import { validatedBody } from '../../../platform/http/validate.js';
import { devSignIn } from '../application/devSignIn.js';

export async function devSignInHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<{ email: string; role?: CommitteeRole }>(req);
  res.status(200).json(await devSignIn(body));
}
