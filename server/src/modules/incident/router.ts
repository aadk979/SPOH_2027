import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  CreateIncidentFollowUpRequest,
  CreateIncidentRequest,
  Id,
  ListIncidentsQuery,
  UpdateIncidentStatusRequest,
} from '@spoh/shared';
import { getAuth, requireAuth } from '../../middleware/auth/index.js';
import { idempotent } from '../../middleware/idempotency.js';
import { defaultRateLimit } from '../../middleware/rateLimit.js';
import { requireCapability } from '../../middleware/rbac.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../middleware/validate.js';
import { auditContextFrom } from '../../lib/requestContext.js';
import {
  appendFollowUp,
  changeIncidentStatus,
  listIncidentRecords,
  reportIncident,
} from './service.js';

/** Incident reporting (BUILD_PLAN §7.2). */
export const incidentRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

incidentRouter.use(requireAuth);

/** Every role can report, including Lead — anyone on the floor may see something. */
incidentRouter.post(
  '/',
  defaultRateLimit,
  requireCapability('incident.report'),
  validate({ body: CreateIncidentRequest }),
  idempotent('POST /incidents'),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const body = validatedBody<CreateIncidentRequest>(req);
    const incident = await reportIncident(body, auth.volunteerId, auditContextFrom(req));
    res.status(201).json({ incident });
  },
);

incidentRouter.get(
  '/',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ query: ListIncidentsQuery }),
  async (req: Request, res: Response) => {
    const query = validatedQuery<ListIncidentsQuery>(req);
    const incidents = await listIncidentRecords(query);
    res.status(200).json({
      data: incidents,
      meta: { count: incidents.length, nextCursor: incidents.at(-1)?.id ?? null },
    });
  },
);

incidentRouter.post(
  '/:id/follow-ups',
  defaultRateLimit,
  requireCapability('incident.resolve'),
  validate({ params: IdParams, body: CreateIncidentFollowUpRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const body = validatedBody<CreateIncidentFollowUpRequest>(req);
    const incident = await appendFollowUp(id, body, auth.volunteerId, auditContextFrom(req));
    res.status(201).json({ incident });
  },
);

incidentRouter.post(
  '/:id/status',
  defaultRateLimit,
  requireCapability('incident.resolve'),
  validate({ params: IdParams, body: UpdateIncidentStatusRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const body = validatedBody<UpdateIncidentStatusRequest>(req);
    const incident = await changeIncidentStatus(id, body, auth.volunteerId, auditContextFrom(req));
    res.status(200).json({ incident });
  },
);
