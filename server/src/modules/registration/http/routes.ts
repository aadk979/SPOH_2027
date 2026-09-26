import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  CreateGroupRegistrationRequest,
  CreateRegistrationRequest,
  Id,
  RegistrationSummaryQuery,
  VoidRegistrationRequest,
} from '@spoh/shared';
import { requireAuth } from '../../../platform/identity/index.js';
import { idempotent } from '../../../platform/idempotency/index.js';
import { captureRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability, requireStationScope } from '../../../platform/access/index.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../../platform/http/validate.js';
import { captureActorFrom } from '../../../platform/http/captureActor.js';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import {
  recordGroupRegistration,
  recordRegistration,
  summariseRegistrations,
  voidRegistrationById,
} from '../application/registrations.js';

/** COUNT 1 — the sign-up booth (BUILD_PLAN §7.2). */
export const registrationRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

registrationRouter.use(requireAuth);

/**
 * One tap, one registration. The middleware order is load-bearing:
 * capability -> station scope -> validate -> idempotency -> handler.
 * Validation must precede idempotency so a malformed body is rejected before a
 * key is reserved, and station scope reads `stationId` from the raw body, which
 * is why it can sit ahead of validation without needing the parsed value.
 */
registrationRouter.post(
  '/',
  captureRateLimit,
  requireCapability('registration.create'),
  validate({ body: CreateRegistrationRequest }),
  requireStationScope(),
  idempotent('POST /registrations'),
  async (req: Request, res: Response) => {
    const body = validatedBody<CreateRegistrationRequest>(req);
    const result = await recordRegistration(body, captureActorFrom(req), auditContextFrom(req));
    res.status(201).json(result);
  },
);

/** A family arriving together: several registrations, one Mission Card. */
registrationRouter.post(
  '/group',
  captureRateLimit,
  requireCapability('registration.create'),
  validate({ body: CreateGroupRegistrationRequest }),
  requireStationScope(),
  idempotent('POST /registrations/group'),
  async (req: Request, res: Response) => {
    const body = validatedBody<CreateGroupRegistrationRequest>(req);
    const result = await recordGroupRegistration(
      body,
      captureActorFrom(req),
      auditContextFrom(req),
    );
    res.status(201).json(result);
  },
);

registrationRouter.post(
  '/:id/void',
  defaultRateLimit,
  requireCapability('record.void'),
  validate({ params: IdParams, body: VoidRegistrationRequest }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const { reason } = validatedBody<VoidRegistrationRequest>(req);
    await voidRegistrationById(id, reason, auditContextFrom(req));
    res.status(204).send();
  },
);

registrationRouter.get(
  '/summary',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ query: RegistrationSummaryQuery }),
  async (req: Request, res: Response) => {
    const query = validatedQuery<RegistrationSummaryQuery>(req);
    res.status(200).json(await summariseRegistrations(query));
  },
);
