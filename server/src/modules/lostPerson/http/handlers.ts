import type { Request, Response } from 'express';
import type { RaiseLostPersonRequest, ResolveLostPersonRequest } from '@spoh/shared';
import { actorContextFrom, auditContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { getAuth } from '../../../platform/identity/index.js';
import { acknowledge } from '../application/acknowledge.js';
import { getAlert } from '../application/alertRecord.js';
import { getActiveAlerts } from '../application/getActiveAlerts.js';
import { raiseAlert } from '../application/raiseAlert.js';
import { resolve } from '../application/resolve.js';

const idOf = (req: Request): string => validatedParams<{ id: string }>(req).id;

/**
 * The create response describes a person, so its replay copy holds only the
 * alert id and a retry re-reads the alert (F04-013). A replay after the purge
 * returns the alert without its description, as every other read does.
 */
export const raiseReplay = {
  store: (body: unknown) => ({ alertId: (body as { alert: { id: string } }).alert.id }),
  replay: async (req: Request, stored: unknown) => {
    const { alertId } = stored as { alertId: string };
    return { alert: await getAlert(alertId, getAuth(req).volunteerId) };
  },
};

export async function raiseAlertHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<RaiseLostPersonRequest>(req);
  res.status(201).json({ alert: await raiseAlert(body, actorContextFrom(req)) });
}

export async function activeAlertsHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await getActiveAlerts(getAuth(req).volunteerId));
}

export async function acknowledgeHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({ alert: await acknowledge(idOf(req), getAuth(req).volunteerId) });
}

export async function resolveHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<ResolveLostPersonRequest>(req);
  res.status(200).json({ alert: await resolve(idOf(req), body, auditContextFrom(req)) });
}
