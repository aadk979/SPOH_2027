import type { Request, Response } from 'express';
import type { EventSettingHistoryQuery } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedQuery } from '../../../platform/http/validate.js';
import { readEventSettingHistory } from '../application/readEventSettingHistory.js';

export async function getEventSettingHistoryHandler(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res
    .status(200)
    .json(
      await readEventSettingHistory(
        validatedQuery<EventSettingHistoryQuery>(req),
        actorContextFrom(req),
      ),
    );
}
