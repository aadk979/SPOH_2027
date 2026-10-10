import type { Request, Response } from 'express';
import type {
  RenameEventRequest,
  RenameEventResponse,
  CreateEventRequest,
  CloneEventWizardRequest,
} from '@spoh/shared';
import { actorContextFrom, auditContextFrom } from '../../../platform/http/auditContext.js';
import { getPerson } from '../../../platform/http/requireAuth.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { listMyEvents } from '../application/listMyEvents.js';
import { renameEvent } from '../application/renameEvent.js';
import { createManagedEvent, cloneManagedEvent } from '../application/createManagedEvent.js';
import { readEventAdministration } from '../application/readEventAdministration.js';

function platformActor(req: Request) {
  const person = getPerson(req);
  return {
    ...person,
    audit: { ...auditContextFrom(req), actorId: person.personId, actorSub: person.sub },
  };
}
export async function eventAdministrationHandler(req: Request, res: Response): Promise<void> {
  res
    .set('Cache-Control', 'no-store')
    .status(200)
    .json(await readEventAdministration(getPerson(req).personId));
}
export async function createEventHandler(req: Request, res: Response): Promise<void> {
  res
    .set('Cache-Control', 'no-store')
    .status(201)
    .json(await createManagedEvent(validatedBody<CreateEventRequest>(req), platformActor(req)));
}
export async function cloneEventHandler(req: Request, res: Response): Promise<void> {
  res
    .set('Cache-Control', 'no-store')
    .status(201)
    .json(await cloneManagedEvent(validatedBody<CloneEventWizardRequest>(req), platformActor(req)));
}

export async function listMyEventsHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await listMyEvents(getPerson(req).personId) });
}

export async function renameEventHandler(req: Request, res: Response): Promise<void> {
  const change = validatedBody<RenameEventRequest>(req);
  const body: RenameEventResponse = { event: await renameEvent(change, actorContextFrom(req)) };
  res.status(200).json(body);
}
