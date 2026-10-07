import type { Request, Response } from 'express';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { readClientSettings } from '../application/readClientSettings.js';

export async function getClientSettingsHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await readClientSettings(actorContextFrom(req)));
}
