import type { Request, Response } from 'express';
import type { BulkPeopleRequest } from '@spoh/shared';
import { getAuth } from '../../../platform/http/requireAuth.js';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { bulkPeople } from '../application/bulkPeople.js';
import { resendInvite, signOutPerson } from '../application/invitations.js';

function manager(req: Request) {
  const auth = getAuth(req);
  return {
    volunteerId: auth.volunteerId,
    role: auth.role,
    scope: { eventId: auth.eventId },
    audit: auditContextFrom(req),
  };
}
export async function bulkPeopleHandler(req: Request, res: Response) {
  res.json(await bulkPeople(validatedBody<BulkPeopleRequest>(req), manager(req)));
}
export async function resendInviteHandler(req: Request, res: Response) {
  res.json(await resendInvite(validatedParams<{ id: string }>(req).id, manager(req)));
}
export async function signOutPersonHandler(req: Request, res: Response) {
  res.json(await signOutPerson(validatedParams<{ id: string }>(req).id, manager(req)));
}
