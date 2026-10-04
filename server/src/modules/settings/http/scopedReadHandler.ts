import type { Request, Response } from 'express';
import type { ScopedSettingsReadQuery } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedQuery } from '../../../platform/http/validate.js';
import { readScopedSettings } from '../application/readScopedSettings.js';

export async function getScopedSettingsHandler(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res
    .status(200)
    .json(
      await readScopedSettings(validatedQuery<ScopedSettingsReadQuery>(req), actorContextFrom(req)),
    );
}
