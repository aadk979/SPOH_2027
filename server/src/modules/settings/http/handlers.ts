import type { Request, Response } from 'express';
import type { ChangeEventSettingRequest, UpdateSettingsRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { getAuth, scopeOf } from '../../../platform/http/requireAuth.js';
import { eventSettings } from '../../../platform/settings/eventSettings.js';
import { changeEventSetting } from '../application/changeEventSetting.js';
import { getSettingsView, updateSettingsView } from '../application/settingsView.js';

export async function getSettingsHandler(_req: Request, res: Response): Promise<void> {
  res.status(200).json(await getSettingsView());
}

export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  const patch = validatedBody<UpdateSettingsRequest>(req);
  const actor = { ...actorContextFrom(req), displayName: getAuth(req).displayName };
  res.status(200).json(await updateSettingsView(patch, actor));
}

export async function getEventSettingsHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await eventSettings(scopeOf(req)));
}

export async function changeEventSettingHandler(req: Request, res: Response): Promise<void> {
  const change = validatedBody<ChangeEventSettingRequest>(req);
  res.status(200).json(await changeEventSetting(change, actorContextFrom(req)));
}
