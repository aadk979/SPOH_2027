import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Id, ProvisionVolunteerRequest, RosterImportRequest } from '@spoh/shared';
import { getAuth, requireAuth } from '../../middleware/auth/index.js';
import { defaultRateLimit, sensitiveRateLimit } from '../../middleware/rateLimit.js';
import { requireCapability } from '../../middleware/rbac.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../middleware/validate.js';
import { auditContextFrom } from '../../lib/requestContext.js';
import { getMe } from '../me/service.js';
import { getStationRoster, importRoster, provisionVolunteer, type RosterActor } from './service.js';

/** Roster, provisioning and shift views (BUILD_PLAN §7.2). */
export const rosterRouter: Router = Router();

const StationIdParams = z.object({ stationId: Id }).strict();
const StationRosterQuery = z.object({ eventDayId: Id.optional() }).strict();

rosterRouter.use(requireAuth);

function actorFrom(req: Request): RosterActor {
  const auth = getAuth(req);
  return { volunteerId: auth.volunteerId, role: auth.role };
}

/** My own shifts. Same payload as `/me`, reachable from the shift screen. */
rosterRouter.get(
  '/me',
  defaultRateLimit,
  requireCapability('own.read'),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const me = await getMe(auth.volunteerId);
    res.status(200).json({
      data: me.upcomingAssignments,
      meta: { count: me.upcomingAssignments.length, nextCursor: null },
    });
  },
);

rosterRouter.get(
  '/station/:stationId',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ params: StationIdParams, query: StationRosterQuery }),
  async (req: Request, res: Response) => {
    const { stationId } = validatedParams<z.infer<typeof StationIdParams>>(req);
    const { eventDayId } = validatedQuery<z.infer<typeof StationRosterQuery>>(req);
    const roster = await getStationRoster(stationId, eventDayId);
    res.status(200).json({ data: roster, meta: { count: roster.length, nextCursor: null } });
  },
);

/**
 * Provisioning is Chief and Admin only, and rate limited hard — it sends email
 * and creates identities, so it is exactly the endpoint you do not want anyone
 * hammering.
 */
rosterRouter.post(
  '/volunteers',
  sensitiveRateLimit,
  requireCapability('user.provision'),
  validate({ body: ProvisionVolunteerRequest }),
  async (req: Request, res: Response) => {
    const body = validatedBody<ProvisionVolunteerRequest>(req);
    const result = await provisionVolunteer(body, actorFrom(req), auditContextFrom(req));
    res.status(201).json(result);
  },
);

/**
 * Roster import. Defaults to a dry run; `commit: true` writes. DC and above can
 * edit the roster, but only Chief/Admin can create identities — so a DC running
 * this against rows for people who do not yet have accounts will see them
 * reported rather than silently provisioned.
 */
rosterRouter.post(
  '/import',
  sensitiveRateLimit,
  requireCapability('roster.edit'),
  validate({ body: RosterImportRequest }),
  async (req: Request, res: Response) => {
    const body = validatedBody<RosterImportRequest>(req);
    const result = await importRoster(body, actorFrom(req), auditContextFrom(req));
    res.status(200).json(result);
  },
);
