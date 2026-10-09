import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import { theEvent, self, fromParam, invite } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import { Id, ProvisionVolunteerRequest, RosterImportRequest } from '@spoh/shared';
import { defaultRateLimit, sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
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
rosterRouter.get('/me', defaultRateLimit, authorize('Self.Read', self), myShiftsHandler);

rosterRouter.get(
  '/station/:stationId',
  defaultRateLimit,
  authorize('Roster.ReadStation', fromParam('Station', 'stationId'), { changes: ['C3'] }),
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
  authorizeAll('People.Invite', invite, { changes: ['C5'] }),
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
  authorize('Roster.Edit', theEvent, { changes: ['C5'] }),
  validate({ body: RosterImportRequest }),
  importRosterHandler,
);
