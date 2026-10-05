import type { Request, Response } from 'express';
import type { ScopedSettingsHistoryQuery } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedQuery } from '../../../platform/http/validate.js';
import { readScopedHistory } from '../application/readScopedHistory.js';

export async function getScopedHistoryHandler(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(
      await readScopedHistory(
        validatedQuery<ScopedSettingsHistoryQuery>(req),
        actorContextFrom(req),
      ),
    );
}
