import type { Request, Response } from 'express';
import type { ProvisionVolunteerRequest, RosterImportRequest } from '@spoh/shared';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { getAuth } from '../../../platform/identity/index.js';
import { getMe } from '../../me/service.js';
import type { RosterActor } from '../application/context.js';
import { importRoster } from '../application/importRoster.js';
import { provisionVolunteer } from '../application/provisionVolunteer.js';

function actorFrom(req: Request): RosterActor {
  const auth = getAuth(req);
  return {
    volunteerId: auth.volunteerId,
    role: auth.role,
    audit: auditContextFrom(req),
    mayProvision: auth.capabilities.includes('user.provision'),
  };
}

/** My own shifts. Same payload as `/me`, reachable from the shift screen. */
export async function myShiftsHandler(req: Request, res: Response): Promise<void> {
  const me = await getMe(getAuth(req).volunteerId);
  res.status(200).json({
    data: me.upcomingAssignments,
    meta: { count: me.upcomingAssignments.length, nextCursor: null },
  });
}

export async function provisionVolunteerHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<ProvisionVolunteerRequest>(req);
  res.status(201).json(await provisionVolunteer(body, actorFrom(req)));
}

export async function importRosterHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<RosterImportRequest>(req);
  res.status(200).json(await importRoster(body, actorFrom(req)));
}
