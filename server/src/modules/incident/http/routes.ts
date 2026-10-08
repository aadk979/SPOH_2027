import { authorize } from '../../../platform/http/authorize.js';
import { theEvent, fromParam } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import {
  CreateIncidentFollowUpRequest,
  CreateIncidentRequest,
  Id,
  ListIncidentsQuery,
  UpdateIncidentStatusRequest,
} from '@spoh/shared';
import { idempotent } from '../../../platform/http/idempotency.js';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/http/access.js';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { validate } from '../../../platform/http/validate.js';
import {
  appendFollowUpHandler,
  changeIncidentStatusHandler,
  listIncidentsHandler,
  reportIncidentHandler,
} from './handlers.js';

/** Incident reporting (BUILD_PLAN §7.2). */
export const incidentRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

incidentRouter.use(requireAuth);

/** Every role can report, including Lead — anyone on the floor may see something. */
incidentRouter.post(
  '/',
  defaultRateLimit,
  authorize('Incident.Report', theEvent),
  requireCapability('incident.report'),
  validate({ body: CreateIncidentRequest }),
  idempotent('POST /incidents'),
  reportIncidentHandler,
);

incidentRouter.get(
  '/',
  defaultRateLimit,
  authorize('Incident.Read', theEvent),
  requireCapability('dashboard.station.read'),
  validate({ query: ListIncidentsQuery }),
  listIncidentsHandler,
);

incidentRouter.post(
  '/:id/follow-ups',
  defaultRateLimit,
  authorize('Incident.Update', fromParam('Incident')),
  requireCapability('incident.resolve'),
  validate({ params: IdParams, body: CreateIncidentFollowUpRequest }),
  appendFollowUpHandler,
);

incidentRouter.post(
  '/:id/status',
  defaultRateLimit,
  authorize('Incident.Update', fromParam('Incident')),
  requireCapability('incident.resolve'),
  validate({ params: IdParams, body: UpdateIncidentStatusRequest }),
  changeIncidentStatusHandler,
);
