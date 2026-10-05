import type { Router } from 'express';
import {
  ChangeEventSettingRequest,
  EventSettingHistoryQuery,
  ScopedSettingsReadQuery,
  ScopedSettingsMutationRequest,
  ScopedSettingsHistoryQuery,
  ScopedSettingsRevertRequest,
  RevertEventSettingRequest,
  UpdateSettingsRequest,
} from '@spoh/shared';
import { adminRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/http/access.js';
import { validate } from '../../../platform/http/validate.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import {
  changeEventSettingHandler,
  getEventSettingsHandler,
  getSettingsHandler,
  updateSettingsHandler,
  getEventSettingHistoryHandler,
  getScopedSettingsHandler,
  getScopedHistoryHandler,
  revertScopedSettingHandler,
  scopedSettingRevertReplay,
  mutateScopedSettingHandler,
  scopedSettingMutationReplay,
  revertEventSettingHandler,
  eventSettingRevertReplay,
} from '../../settings/index.js';

/** Register directly on the authenticated admin router, keeping the isolation inventory flat. */
export function registerSettingsRoutes(router: Router): void {
  registerOperationalSettingsRoutes(router);
  registerProductSettingsRoutes(router);
}

function registerOperationalSettingsRoutes(router: Router): void {
  // ─────────────────────────────────────────────────────────────
  // RUNTIME SETTINGS
  // ─────────────────────────────────────────────────────────────

  /**
   * Readable by anyone signed in.
   *
   * The client needs the poll intervals, the undo window and the outbox warning
   * thresholds to behave consistently with the server, and none of it is
   * sensitive — it is the tuning of an event, not a secret.
   */
  router.get('/settings', defaultRateLimit, requireCapability('own.read'), getSettingsHandler);

  router.get(
    '/settings/catalogue',
    defaultRateLimit,
    requireCapability('config.manage'),
    validate({ query: ScopedSettingsReadQuery }),
    getScopedSettingsHandler,
  );

  router.get(
    '/settings/catalogue/history',
    defaultRateLimit,
    requireCapability('config.manage'),
    validate({ query: ScopedSettingsHistoryQuery }),
    getScopedHistoryHandler,
  );

  router.patch(
    '/settings',
    adminRateLimit,
    requireCapability('config.manage'),
    validate({ body: UpdateSettingsRequest }),
    updateSettingsHandler,
  );

  router.post(
    '/settings/catalogue',
    adminRateLimit,
    requireCapability('config.manage'),
    validate({ body: ScopedSettingsMutationRequest }),
    idempotent('setting.operational.change', { redacted: scopedSettingMutationReplay }),
    mutateScopedSettingHandler,
  );
  router.post(
    '/settings/catalogue/revert',
    adminRateLimit,
    requireCapability('config.manage'),
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
    requireCapability('own.read'),
    getEventSettingsHandler,
  );

  router.patch(
    '/event-settings',
    adminRateLimit,
    requireCapability('config.manage'),
    validate({ body: ChangeEventSettingRequest }),
    changeEventSettingHandler,
  );

  router.get(
    '/event-settings/history',
    defaultRateLimit,
    requireCapability('config.manage'),
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
    requireCapability('config.manage'),
    validate({ body: RevertEventSettingRequest }),
    idempotent('setting.product.revert', { redacted: eventSettingRevertReplay }),
    revertEventSettingHandler,
  );
}
