import type { Request, Response } from 'express';
import type { ChangeEventSettingRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { eventSettings } from '../../../platform/settings/eventSettings.js';
import { changeEventSetting } from '../application/changeEventSetting.js';

export async function getEventSettingsHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await eventSettings(scopeOf(req)));
}

export async function changeEventSettingHandler(req: Request, res: Response): Promise<void> {
  const change = validatedBody<ChangeEventSettingRequest>(req);
  res.status(200).json(await changeEventSetting(change, actorContextFrom(req)));
}
