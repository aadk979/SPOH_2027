import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import {
  theEvent,
  self,
  settingFromBody,
  organisationAdmin,
  operationalSettingFromBody,
} from '../../../platform/http/authorizeResources.js';
import type { Router } from 'express';
import { z } from 'zod';
import {
  ChangeEventSettingRequest,
  ChangeOrganisationSettingRequest,
  EventSettingHistoryQuery,
  ScopedSettingsReadQuery,
  ScopedSettingsMutationRequest,
  ScopedSettingsHistoryQuery,
  ScopedSettingsRevertRequest,
  RevertEventSettingRequest,
  CreateCaptureScheduleRequest,
  CaptureScheduleListQuery,
  UpdateCaptureScheduleRequest,
  CancelCaptureScheduleRequest,
  Id,
} from '@spoh/shared';
import { adminRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import {
  changeEventSettingHandler,
  getEventSettingsHandler,
  changeOrganisationSettingHandler,
  getClientSettingsHandler,
  getOrganisationSettingsHandler,
  getEventSettingHistoryHandler,
  getScopedSettingsHandler,
  getScopedHistoryHandler,
  revertScopedSettingHandler,
  scopedSettingRevertReplay,
  mutateScopedSettingHandler,
  scopedSettingMutationReplay,
  revertEventSettingHandler,
  eventSettingRevertReplay,
  captureScheduleReplay,
  createCaptureScheduleHandler,
  getCaptureScheduleHandler,
  listCaptureSchedulesHandler,
  updateCaptureScheduleHandler,
  cancelCaptureScheduleHandler,
  captureScheduleEditReplay,
  captureScheduleCancelReplay,
} from '../../settings/index.js';

/** Register directly on the authenticated admin router, keeping the isolation inventory flat. */
export function registerSettingsRoutes(router: Router): void {
  registerOperationalSettingsRoutes(router);
  registerOrganisationSettingsRoutes(router);
  registerCaptureScheduleRoutes(router);
  registerCaptureScheduleManagementRoutes(router);
  registerProductSettingsRoutes(router);
}

function registerCaptureScheduleManagementRoutes(router: Router): void {
  router.get(
    '/settings/catalogue/schedules',
    defaultRateLimit,
    authorize('Settings.Read', theEvent, { changes: ['C14'] }),
    validate({ query: CaptureScheduleListQuery }),
    listCaptureSchedulesHandler,
  );
  router.patch(
    '/settings/catalogue/schedules/:id',
    adminRateLimit,
    authorize('Schedule.Manage', theEvent),
    validate({
      params: z.object({ id: Id }).strict(),
      body: UpdateCaptureScheduleRequest,
      query: z.object({}).strict(),
    }),
    idempotent('setting.capture.schedule.update', { redacted: captureScheduleEditReplay }),
    updateCaptureScheduleHandler,
  );
  router.post(
    '/settings/catalogue/schedules/:id/cancel',
    adminRateLimit,
    authorize('Schedule.Manage', theEvent),
    validate({
      params: z.object({ id: Id }).strict(),
      body: CancelCaptureScheduleRequest,
      query: z.object({}).strict(),
    }),
    idempotent('setting.capture.schedule.cancel', { redacted: captureScheduleCancelReplay }),
    cancelCaptureScheduleHandler,
  );
}

function registerCaptureScheduleRoutes(router: Router): void {
  router.post(
    '/settings/catalogue/schedules',
    adminRateLimit,
    authorize('Schedule.Manage', theEvent),
    validate({ body: CreateCaptureScheduleRequest }),
    idempotent('setting.capture.schedule', { redacted: captureScheduleReplay }),
    createCaptureScheduleHandler,
  );
  router.get(
    '/settings/catalogue/schedules/:id',
    defaultRateLimit,
    authorize('Settings.Read', theEvent, { changes: ['C14'] }),
    validate({ params: z.object({ id: Id }).strict(), query: z.object({}).strict() }),
    getCaptureScheduleHandler,
  );
}

function registerOperationalSettingsRoutes(router: Router): void {
  // ─────────────────────────────────────────────────────────────
  // RUNTIME SETTINGS
  // ─────────────────────────────────────────────────────────────

  /**
   * The device tuning, resolved for the caller's own event (P10.2): the client
   * needs the poll intervals, the undo window and the outbox warning thresholds
   * to behave consistently with the server, and none of it is sensitive.
   */
  router.get(
    '/settings/client',
    defaultRateLimit,
    authorize('Self.Read', self),
    getClientSettingsHandler,
  );

  router.get(
    '/settings/catalogue',
    defaultRateLimit,
    authorize('Settings.Read', theEvent, { changes: ['C14'] }),
    validate({ query: ScopedSettingsReadQuery }),
    getScopedSettingsHandler,
  );

  router.get(
    '/settings/catalogue/history',
    defaultRateLimit,
    authorize('Settings.Read', theEvent, { changes: ['C14'] }),
    validate({ query: ScopedSettingsHistoryQuery }),
    getScopedHistoryHandler,
  );

  router.post(
    '/settings/catalogue',
    adminRateLimit,
    authorizeAll('Settings.ManageEvent', operationalSettingFromBody),
    validate({ body: ScopedSettingsMutationRequest }),
    idempotent('setting.operational.change', { redacted: scopedSettingMutationReplay }),
    mutateScopedSettingHandler,
  );
  router.post(
    '/settings/catalogue/revert',
    adminRateLimit,
    authorizeAll('Settings.ManageEvent', operationalSettingFromBody),
    validate({ body: ScopedSettingsRevertRequest }),
    idempotent('setting.operational.revert', { redacted: scopedSettingRevertReplay }),
    revertScopedSettingHandler,
  );
}

function registerProductSettingsRoutes(router: Router): void {
  // ─────────────────────────────────────────────────────────────
  // EVENT SETTINGS (ADR-003): the event's product rules (ADR-002 §4)
  // ─────────────────────────────────────────────────────────────

  /** Readable by every member: the client shows counts the way the event chose. */
  router.get(
    '/event-settings',
    defaultRateLimit,
    authorize('Self.Read', self),
    getEventSettingsHandler,
  );

  router.patch(
    '/event-settings',
    adminRateLimit,
    authorizeAll('Settings', settingFromBody, { changes: ['C9'] }),
    validate({ body: ChangeEventSettingRequest }),
    changeEventSettingHandler,
  );

  router.get(
    '/event-settings/history',
    defaultRateLimit,
    authorize('Settings.Read', theEvent, { changes: ['C14'] }),
    validate({ query: EventSettingHistoryQuery }),
    getEventSettingHistoryHandler,
  );

  router.use('/event-settings/revert', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.post(
    '/event-settings/revert',
    adminRateLimit,
    authorizeAll('Settings', settingFromBody, { changes: ['C9'] }),
    validate({ body: RevertEventSettingRequest }),
    idempotent('setting.product.revert', { redacted: eventSettingRevertReplay }),
    revertEventSettingHandler,
  );
}

/**
 * Organisation-wide settings (platform scope). Event Chiefs and Admins read
 * them; only the organisation's platform admins change them, checked against
 * the current organisation membership inside the write (D-17).
 */
function registerOrganisationSettingsRoutes(router: Router): void {
  router.get(
    '/organisation-settings',
    defaultRateLimit,
    authorize('Self.Read', self),
    getOrganisationSettingsHandler,
  );
  router.patch(
    '/organisation-settings',
    adminRateLimit,
    authorizeAll('Platform.ManageOrganisation', organisationAdmin),
    validate({ body: ChangeOrganisationSettingRequest }),
    changeOrganisationSettingHandler,
  );
}
