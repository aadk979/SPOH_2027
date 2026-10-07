import type { Request, Response } from 'express';
import type { ChangeOrganisationSettingRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody } from '../../../platform/http/validate.js';
import {
  changeOrganisationSetting,
  readOrganisationSettings,
} from '../application/organisationSettings.js';

export async function getOrganisationSettingsHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await readOrganisationSettings(actorContextFrom(req)));
}

export async function changeOrganisationSettingHandler(req: Request, res: Response): Promise<void> {
  const change = validatedBody<ChangeOrganisationSettingRequest>(req);
  res.status(200).json(await changeOrganisationSetting(change, actorContextFrom(req)));
}
