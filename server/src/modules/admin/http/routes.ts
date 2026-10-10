import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import {
  theEvent,
  self,
  fromParam,
  memberFromPersonParam,
  settingFromBody,
  memberEdit,
} from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import {
  ChangeAttendanceConfigRequest,
  CreateAssignmentRequest,
  CreateEventDayRequest,
  CreateGiftTypeRequest,
  CreateStationRequest,
  CreateVisitorFieldRequest,
  DeactivateVolunteerRequest,
  RenameEventRequest,
  Id,
  ListVolunteersQuery,
  TestAttendanceNetworkRequest,
  UpdateEventDayRequest,
  UpdateGiftTypeRequest,
  UpdateShiftTemplateRequest,
  UpdateStationRequest,
  UpdateVisitorFieldRequest,
  UpdateVolunteerRequest,
} from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { adminRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
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
import { renameEventHandler } from '../../event/index.js';
import { registerSettingsRoutes } from './settingsRoutes.js';
import { registerPeopleLifecycleRoutes } from './peopleLifecycleRoutes.js';
import { optionalIdempotent } from '../../../platform/http/optionalIdempotency.js';
import { volunteerMutationReplay } from '../../people/index.js';
import { registerCategoryScheduleRoutes } from './categoryScheduleRoutes.js';
import {
  changeAttendanceConfigHandler,
  getAttendanceConfigHandler,
  testAttendanceNetworkHandler,
} from '../../attendance/index.js';
import {
  createVisitorFieldHandler,
  listVisitorFieldsHandler,
  updateVisitorFieldHandler,
} from '../../visitor/index.js';
import { createGiftTypeHandler, updateGiftTypeHandler } from '../../gift/index.js';
import {
  createEventDayHandler,
  listEventDaysHandler,
  listShiftTemplatesHandler,
  updateEventDayHandler,
  updateShiftTemplateHandler,
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

adminRouter.use('/settings/catalogue', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
adminRouter.use('/organisation-settings', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
adminRouter.use('/event-name', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
adminRouter.use('/settings/client', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
adminRouter.use('/capture-categories', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
adminRouter.use(requireAuth);
registerPeopleLifecycleRoutes(adminRouter);

// ─────────────────────────────────────────────────────────────
// VOLUNTEERS
// ─────────────────────────────────────────────────────────────

adminRouter.get(
  '/volunteers',
  defaultRateLimit,
  authorize('People.Read', theEvent),
  validate({ query: ListVolunteersQuery }),
  listVolunteersHandler,
);

adminRouter.get(
  '/volunteers/:id',
  defaultRateLimit,
  authorize('People.Read', theEvent),
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
  authorizeAll('People.Update', memberEdit(memberFromPersonParam()), { changes: ['C5'] }),
  validate({ params: IdParams, body: UpdateVolunteerRequest }),
  optionalIdempotent('people.update', volunteerMutationReplay),
  updateVolunteerHandler,
);

adminRouter.post(
  '/volunteers/:id/deactivate',
  adminRateLimit,
  authorize('People.Deactivate', memberFromPersonParam()),
  validate({ params: IdParams, body: DeactivateVolunteerRequest }),
  optionalIdempotent('people.deactivate', volunteerMutationReplay),
  deactivateVolunteerHandler,
);

adminRouter.post(
  '/volunteers/:id/reactivate',
  adminRateLimit,
  authorize('People.Deactivate', memberFromPersonParam()),
  validate({ params: IdParams }),
  optionalIdempotent('people.reactivate', volunteerMutationReplay),
  reactivateVolunteerHandler,
);

// ─────────────────────────────────────────────────────────────
// ASSIGNMENTS
// ─────────────────────────────────────────────────────────────

adminRouter.post(
  '/assignments',
  defaultRateLimit,
  authorize('Roster.Edit', theEvent),
  validate({ body: CreateAssignmentRequest }),
  createAssignmentHandler,
);

adminRouter.delete(
  '/assignments/:id',
  defaultRateLimit,
  authorize('Roster.Edit', fromParam('ShiftAssignment')),
  validate({ params: IdParams }),
  deleteAssignmentHandler,
);

// ─────────────────────────────────────────────────────────────
// STATIONS
// ─────────────────────────────────────────────────────────────

adminRouter.get(
  '/stations',
  defaultRateLimit,
  authorize('Structure.Read', theEvent, { changes: ['C7'] }),
  listAllStationsHandler,
);

adminRouter.post(
  '/stations',
  adminRateLimit,
  authorize('Structure.Change', theEvent, { changes: ['C15'] }),
  validate({ body: CreateStationRequest }),
  createStationHandler,
);

adminRouter.patch(
  '/stations/:id',
  adminRateLimit,
  authorize('Structure.Edit', theEvent),
  validate({ params: IdParams, body: UpdateStationRequest }),
  updateStationHandler,
);

// ─────────────────────────────────────────────────────────────
// EVENT NAME: what every screen, report and export calls the event
// ─────────────────────────────────────────────────────────────

adminRouter.patch(
  '/event-name',
  adminRateLimit,
  authorize('Structure.Edit', theEvent),
  validate({ body: RenameEventRequest }),
  renameEventHandler,
);

// ─────────────────────────────────────────────────────────────
// EVENT DAYS
// ─────────────────────────────────────────────────────────────

adminRouter.get(
  '/event-days',
  defaultRateLimit,
  authorize('Structure.Read', theEvent, { changes: ['C7'] }),
  // Wider than config.manage: the roster import and the briefing screens both
  // need to know which days exist, and a day is not a secret.
  listEventDaysHandler,
);

adminRouter.post(
  '/event-days',
  adminRateLimit,
  authorize('Structure.Change', theEvent, { changes: ['C15'] }),
  validate({ body: CreateEventDayRequest }),
  createEventDayHandler,
);

adminRouter.patch(
  '/event-days/:id',
  adminRateLimit,
  authorize('Structure.Edit', theEvent),
  validate({ params: IdParams, body: UpdateEventDayRequest }),
  updateEventDayHandler,
);

// ─────────────────────────────────────────────────────────────
// SHIFT TEMPLATES (ADR-002): the hours capture and check-in obey
// ─────────────────────────────────────────────────────────────

adminRouter.get(
  '/shift-templates',
  defaultRateLimit,
  authorize('Structure.Read', theEvent, { changes: ['C7'] }),
  listShiftTemplatesHandler,
);

adminRouter.patch(
  '/shift-templates/:id',
  adminRateLimit,
  authorize('Structure.Edit', theEvent),
  validate({ params: IdParams, body: UpdateShiftTemplateRequest }),
  updateShiftTemplateHandler,
);

// ─────────────────────────────────────────────────────────────
// GIFT TYPES
// ─────────────────────────────────────────────────────────────

adminRouter.post(
  '/gift-types',
  adminRateLimit,
  authorize('Structure.Change', theEvent, { changes: ['C15'] }),
  validate({ body: CreateGiftTypeRequest }),
  createGiftTypeHandler,
);

adminRouter.patch(
  '/gift-types/:id',
  adminRateLimit,
  authorize('Structure.Edit', theEvent),
  validate({ params: IdParams, body: UpdateGiftTypeRequest }),
  updateGiftTypeHandler,
);

registerSettingsRoutes(adminRouter);
registerCategoryScheduleRoutes(adminRouter);

// The attendance root and trusted networks are event-scoped security settings.
adminRouter.get(
  '/attendance-settings',
  defaultRateLimit,
  authorize('Settings.Read', theEvent, { changes: ['C14'] }),
  getAttendanceConfigHandler,
);
adminRouter.patch(
  '/attendance-settings',
  adminRateLimit,
  authorizeAll('Settings', settingFromBody, { changes: ['C9'] }),
  validate({ body: ChangeAttendanceConfigRequest }),
  changeAttendanceConfigHandler,
);
adminRouter.post(
  '/attendance-settings/test-network',
  adminRateLimit,
  authorize('Structure.Edit', theEvent),
  validate({ body: TestAttendanceNetworkRequest }),
  testAttendanceNetworkHandler,
);

// ─────────────────────────────────────────────────────────────
// VISITOR FIELDS (ADR-002 §4): what an allowlist event may collect
// ─────────────────────────────────────────────────────────────

/** Every member: the booth shows the fields, and the copy says what is kept. */
adminRouter.get(
  '/visitor-fields',
  defaultRateLimit,
  authorize('Self.Read', self),
  listVisitorFieldsHandler,
);

adminRouter.post(
  '/visitor-fields',
  adminRateLimit,
  authorize('Structure.Change', theEvent, { changes: ['C15'] }),
  validate({ body: CreateVisitorFieldRequest }),
  createVisitorFieldHandler,
);

adminRouter.patch(
  '/visitor-fields/:id',
  adminRateLimit,
  authorize('Structure.Edit', theEvent),
  validate({ params: IdParams, body: UpdateVisitorFieldRequest }),
  updateVisitorFieldHandler,
);
