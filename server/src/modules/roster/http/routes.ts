import { Router } from 'express';
import { z } from 'zod';
import { Id, ProvisionVolunteerRequest, RosterImportRequest } from '@spoh/shared';
import { defaultRateLimit, sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/http/access.js';
import { stationRosterHandler } from '../../assignments/index.js';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { validate } from '../../../platform/http/validate.js';
import { importRosterHandler, myShiftsHandler, provisionVolunteerHandler } from './handlers.js';

/** Roster, provisioning and shift views (BUILD_PLAN §7.2). */
export const rosterRouter: Router = Router();

const StationIdParams = z.object({ stationId: Id }).strict();
const StationRosterQuery = z.object({ eventDayId: Id.optional() }).strict();

rosterRouter.use(requireAuth);

/** My own shifts. Same payload as `/me`, reachable from the shift screen. */
rosterRouter.get('/me', defaultRateLimit, requireCapability('own.read'), myShiftsHandler);

rosterRouter.get(
  '/station/:stationId',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ params: StationIdParams, query: StationRosterQuery }),
  stationRosterHandler,
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
  provisionVolunteerHandler,
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
  importRosterHandler,
);
