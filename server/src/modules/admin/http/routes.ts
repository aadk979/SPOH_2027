import { Router } from 'express';
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
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { adminRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/http/access.js';
import { validate } from '../../../platform/http/validate.js';
import {
  createStationHandler,
  listAllStationsHandler,
  updateStationHandler,
} from '../../station/index.js';
import {
  deactivateVolunteerHandler,
  getVolunteerHandler,
  listVolunteersHandler,
  reactivateVolunteerHandler,
  updateVolunteerHandler,
} from '../../people/index.js';
import { createAssignmentHandler, deleteAssignmentHandler } from '../../assignments/index.js';
import { getSettingsHandler, updateSettingsHandler } from '../../settings/index.js';
import { createGiftTypeHandler, updateGiftTypeHandler } from '../../gift/index.js';
import {
  createEventDayHandler,
  listEventDaysHandler,
  updateEventDayHandler,
} from '../../eventDays/index.js';

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

// ─────────────────────────────────────────────────────────────
// VOLUNTEERS
// ─────────────────────────────────────────────────────────────

adminRouter.get(
  '/volunteers',
  defaultRateLimit,
  requireCapability('user.read'),
  validate({ query: ListVolunteersQuery }),
  listVolunteersHandler,
);

adminRouter.get(
  '/volunteers/:id',
  defaultRateLimit,
  requireCapability('user.read'),
  validate({ params: IdParams }),
  getVolunteerHandler,
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
  updateVolunteerHandler,
);

adminRouter.post(
  '/volunteers/:id/deactivate',
  adminRateLimit,
  requireCapability('user.provision'),
  validate({ params: IdParams, body: DeactivateVolunteerRequest }),
  deactivateVolunteerHandler,
);

adminRouter.post(
  '/volunteers/:id/reactivate',
  adminRateLimit,
  requireCapability('user.provision'),
  validate({ params: IdParams }),
  reactivateVolunteerHandler,
);

// ─────────────────────────────────────────────────────────────
// ASSIGNMENTS
// ─────────────────────────────────────────────────────────────

adminRouter.post(
  '/assignments',
  defaultRateLimit,
  requireCapability('roster.edit'),
  validate({ body: CreateAssignmentRequest }),
  createAssignmentHandler,
);

adminRouter.delete(
  '/assignments/:id',
  defaultRateLimit,
  requireCapability('roster.edit'),
  validate({ params: IdParams }),
  deleteAssignmentHandler,
);

// ─────────────────────────────────────────────────────────────
// STATIONS
// ─────────────────────────────────────────────────────────────

adminRouter.get(
  '/stations',
  defaultRateLimit,
  requireCapability('config.manage'),
  listAllStationsHandler,
);

adminRouter.post(
  '/stations',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ body: CreateStationRequest }),
  createStationHandler,
);

adminRouter.patch(
  '/stations/:id',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ params: IdParams, body: UpdateStationRequest }),
  updateStationHandler,
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
  listEventDaysHandler,
);

adminRouter.post(
  '/event-days',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ body: CreateEventDayRequest }),
  createEventDayHandler,
);

adminRouter.patch(
  '/event-days/:id',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ params: IdParams, body: UpdateEventDayRequest }),
  updateEventDayHandler,
);

// ─────────────────────────────────────────────────────────────
// GIFT TYPES
// ─────────────────────────────────────────────────────────────

adminRouter.post(
  '/gift-types',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ body: CreateGiftTypeRequest }),
  createGiftTypeHandler,
);

adminRouter.patch(
  '/gift-types/:id',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ params: IdParams, body: UpdateGiftTypeRequest }),
  updateGiftTypeHandler,
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
adminRouter.get('/settings', defaultRateLimit, requireCapability('own.read'), getSettingsHandler);

adminRouter.patch(
  '/settings',
  adminRateLimit,
  requireCapability('config.manage'),
  validate({ body: UpdateSettingsRequest }),
  updateSettingsHandler,
);
