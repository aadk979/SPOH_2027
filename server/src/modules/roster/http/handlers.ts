import { ROLE_RANKS } from '@spoh/access-policies';
import type { Request, Response } from 'express';
import type { ProvisionVolunteerRequest, RosterImportRequest } from '@spoh/shared';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { askEach } from '../../../platform/http/authorize.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { getAuth, scopeOf } from '../../../platform/http/requireAuth.js';
import { getMe } from '../../me/index.js';
import type { RosterActor } from '../application/context.js';
import { importRoster } from '../application/importRoster.js';
import { provisionVolunteer } from '../application/provisionVolunteer.js';

/** An import may create people only where the caller may invite a Volunteer (C5). */
async function actorFrom(req: Request): Promise<RosterActor> {
  const auth = getAuth(req);
  const [invite] = await askEach(req, [
    {
      action: 'People.Invite',
      resource: { type: 'Event', id: auth.eventId },
      facts: { grantedRank: ROLE_RANKS.VOLUNTEER },
    },
  ]);
  return {
    volunteerId: auth.volunteerId,
    role: auth.role,
    scope: { eventId: auth.eventId },
    audit: auditContextFrom(req),
    mayProvision: invite?.allowed ?? false,
  };
}

/** My own shifts. Same payload as `/me`, reachable from the shift screen. */
export async function myShiftsHandler(req: Request, res: Response): Promise<void> {
  const me = await getMe(scopeOf(req), getAuth(req).volunteerId);
  res.status(200).json({
    data: me.upcomingAssignments,
    meta: { count: me.upcomingAssignments.length, nextCursor: null },
  });
}

export async function provisionVolunteerHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<ProvisionVolunteerRequest>(req);
  res.status(201).json(await provisionVolunteer(body, await actorFrom(req)));
}

export async function importRosterHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<RosterImportRequest>(req);
  res.status(200).json(await importRoster(body, await actorFrom(req)));
}
