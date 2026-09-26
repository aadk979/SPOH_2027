import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import {
  CreateAssignmentRequest,
  CreateEventDayRequest,
  CreateGiftTypeRequest,
  CreateStationRequest,
  DeactivateVolunteerRequest,
  Id,
  ListVolunteersQuery,
  UpdateEventDayRequest,
  UpdateGiftTypeRequest,
  UpdateSettingsRequest,
  UpdateStationRequest,
  UpdateVolunteerRequest,
} from '@spoh/shared';
import { getAuth, requireAuth } from '../../platform/identity/index.js';
import { adminRateLimit, defaultRateLimit } from '../../platform/http/rateLimit.js';
import { requireCapability } from '../../platform/access/index.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../platform/http/validate.js';
import { auditContextFrom } from '../../platform/http/auditContext.js';
import { prisma } from '../../platform/db/client.js';
import { getSettings, settingsMeta, updateSettings } from '../../platform/settings/index.js';
import { listStations, toStationSummary } from '../station/index.js';
import {
  createAssignment,
  createEventDay,
  createGiftType,
  createStation,
  deactivateVolunteer,
  deleteAssignment,
  getVolunteer,
  listEventDays,
  listVolunteers,
  reactivateVolunteer,
  updateEventDay,
  updateGiftType,
  updateStation,
  updateVolunteer,
  type Actor,
} from './service.js';

/**
 * Administration: the people, the places, the days and the dials.
 *
 * Split across two capabilities on purpose. `user.read` sees the roster, which
 * a Deputy Coordinator running their own portfolio and a Lead writing the
 * report both legitimately need. `user.provision` changes it, and `config.manage`
 * changes what the event itself is — a shift boundary, a counted room, the
 * threshold that decides a station has gone quiet. Those are Chief and Admin.
 */
export const adminRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

adminRouter.use(requireAuth);

function actorFrom(req: Request): Actor {
  const auth = getAuth(req);
  return { volunteerId: auth.volunteerId, role: auth.role };
}

// ─────────────────────────────────────────────────────────────
// VOLUNTEERS
// ─────────────────────────────────────────────────────────────

adminRouter.get(
  '/volunteers',
  defaultRateLimit,
  requireCapability('user.read'),
  validate({ query: ListVolunteersQuery }),
  async (req: Request, res: Response) => {
    const query = validatedQuery<ListVolunteersQuery>(req);
    const { data, nextCursor } = await listVolunteers(query);
    res.status(200).json({ data, meta: { count: data.length, nextCursor } });
  },
);

adminRouter.get(
  '/volunteers/:id',
  defaultRateLimit,
  requireCapability('user.read'),
  validate({ params: IdParams }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    res.status(200).json({ volunteer: await getVolunteer(id) });
  },
);

/**
 * Editing a volunteer can change a role, which revokes their sessions and
 * touches the identity provider — so it sits on the administration limit rather
 * than the ordinary one, without being pinned to the sensitive ceiling that
 * would stop an admin halfway through correcting a roster.
 */
adminRouter.patch(
  '/volunteers/:id',
  adminRateLimit,
  requireCapability('user.provision'),
  validate({ params: IdParams, body: UpdateVolunteerRequest }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const patch = validatedBody<UpdateVolunteerRequest>(req);
    const result = await updateVolunteer(id, patch, actorFrom(req), auditContextFrom(req));
    res.status(200).json(result);
  },
);

adminRouter.post(
  '/volunteers/:id/deactivate',
  adminRateLimit,
  requireCapability('user.provision'),
  validate({ params: IdParams, body: DeactivateVolunteerRequest }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const body = validatedBody<DeactivateVolunteerRequest>(req);
    const result = await deactivateVolunteer(id, body, actorFrom(req), auditContextFrom(req));
    res.status(200).json(result);
  },
);

adminRouter.post(
  '/volunteers/:id/reactivate',
  adminRateLimit,
  requireCapability('user.provision'),
  validate({ params: IdParams }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const result = await reactivateVolunteer(id, actorFrom(req), auditContextFrom(req));
    res.status(200).json(result);
  },
);

// ─────────────────────────────────────────────────────────────
// ASSIGNMENTS
// ─────────────────────────────────────────────────────────────

adminRouter.post(
  '/assignments',
  defaultRateLimit,
  requireCapability('roster.edit'),
  validate({ body: CreateAssignmentRequest }),
  async (req: Request, res: Response) => {
    const body = validatedBody<CreateAssignmentRequest>(req);
    const assignment = await createAssignment(body, auditContextFrom(req));
    res.status(201).json({ assignment });
  },
);

adminRouter.delete(
  '/assignments/:id',
  defaultRateLimit,
  requireCapability('roster.edit'),
  validate({ params: IdParams }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    await deleteAssignment(id, auditContextFrom(req));
    res.status(204).end();
  },
);

// ─────────────────────────────────────────────────────────────
// STATIONS
// ─────────────────────────────────────────────────────────────

/**
 * Includes inactive stations, unlike `GET /stations`.
 *
 * The public list is the map legend and must not offer a closed room as a
 * capture target; this one is the configuration screen, where a closed room is
 * exactly what you came to reopen.
 */
adminRouter.get(
  '/stations',
  defaultRateLimit,
  requireCapability('config.manage'),
  async (_req: Request, res: Response) => {
    const stations = (await listStations({ includeInactive: true })).map(toStationSummary);
    res.status(200).json({ data: stations, meta: { count: stations.length, nextCursor: null } });
  },
);

adminRouter.post(
  '/stations',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ body: CreateStationRequest }),
  async (req: Request, res: Response) => {
    const body = validatedBody<CreateStationRequest>(req);
    res.status(201).json({ station: await createStation(body, auditContextFrom(req)) });
  },
);

adminRouter.patch(
  '/stations/:id',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ params: IdParams, body: UpdateStationRequest }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const patch = validatedBody<UpdateStationRequest>(req);
    res.status(200).json({ station: await updateStation(id, patch, auditContextFrom(req)) });
  },
);

// ─────────────────────────────────────────────────────────────
// EVENT DAYS
// ─────────────────────────────────────────────────────────────

adminRouter.get(
  '/event-days',
  defaultRateLimit,
  // Wider than config.manage: the roster import and the briefing screens both
  // need to know which days exist, and a day is not a secret.
  requireCapability('user.read'),
  async (_req: Request, res: Response) => {
    const days = await listEventDays();
    res.status(200).json({ data: days, meta: { count: days.length, nextCursor: null } });
  },
);

adminRouter.post(
  '/event-days',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ body: CreateEventDayRequest }),
  async (req: Request, res: Response) => {
    const body = validatedBody<CreateEventDayRequest>(req);
    res.status(201).json({ eventDay: await createEventDay(body, auditContextFrom(req)) });
  },
);

adminRouter.patch(
  '/event-days/:id',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ params: IdParams, body: UpdateEventDayRequest }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const patch = validatedBody<UpdateEventDayRequest>(req);
    res.status(200).json({ eventDay: await updateEventDay(id, patch, auditContextFrom(req)) });
  },
);

// ─────────────────────────────────────────────────────────────
// GIFT TYPES
// ─────────────────────────────────────────────────────────────

adminRouter.post(
  '/gift-types',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ body: CreateGiftTypeRequest }),
  async (req: Request, res: Response) => {
    const body = validatedBody<CreateGiftTypeRequest>(req);
    res.status(201).json({ giftType: await createGiftType(body, auditContextFrom(req)) });
  },
);

adminRouter.patch(
  '/gift-types/:id',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ params: IdParams, body: UpdateGiftTypeRequest }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const patch = validatedBody<UpdateGiftTypeRequest>(req);
    res.status(200).json({ giftType: await updateGiftType(id, patch, auditContextFrom(req)) });
  },
);

// ─────────────────────────────────────────────────────────────
// RUNTIME SETTINGS
// ─────────────────────────────────────────────────────────────

/**
 * Readable by anyone signed in.
 *
 * The client needs the poll intervals, the undo window and the outbox warning
 * thresholds to behave consistently with the server, and none of it is
 * sensitive — it is the tuning of a school open house, not a secret.
 */
adminRouter.get(
  '/settings',
  defaultRateLimit,
  requireCapability('own.read'),
  async (_req: Request, res: Response) => {
    const meta = settingsMeta();

    const updatedBy = meta.updatedById
      ? await prisma.volunteer.findUnique({
          where: { id: meta.updatedById },
          select: { displayName: true },
        })
      : null;

    res.status(200).json({
      settings: getSettings(),
      overriddenKeys: meta.overriddenKeys,
      updatedAt: meta.updatedAt?.toISOString() ?? null,
      updatedById: meta.updatedById,
      updatedByName: updatedBy?.displayName ?? null,
    });
  },
);

adminRouter.patch(
  '/settings',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ body: UpdateSettingsRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const patch = validatedBody<UpdateSettingsRequest>(req);

    const settings = await updateSettings(patch, auth.volunteerId, auditContextFrom(req));
    const meta = settingsMeta();

    res.status(200).json({
      settings,
      overriddenKeys: meta.overriddenKeys,
      updatedAt: meta.updatedAt?.toISOString() ?? null,
      updatedById: meta.updatedById,
      updatedByName: auth.displayName,
    });
  },
);
