import { authorize } from '../../../platform/http/authorize.js';
import { theEvent } from '../../../platform/http/authorizeResources.js';
import type { Router } from 'express';
import { z } from 'zod';
import {
  CategoryActivityListQuery,
  CategoryActivityParams,
  CategoryScheduleListQuery,
  CategoryScheduleParams,
  CreateCategoryScheduleRequest,
  UpdateCategoryScheduleRequest,
  CancelCategoryScheduleRequest,
} from '@spoh/shared';
import { requireCapability } from '../../../platform/http/access.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import { adminRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import {
  listCategoryActivityHandler,
  getCategoryActivityHandler,
  listCategorySchedulesHandler,
  createCategoryScheduleHandler,
  getCategoryScheduleHandler,
  updateCategoryScheduleHandler,
  cancelCategoryScheduleHandler,
  categoryScheduleCreateReplay,
  categoryScheduleEditReplay,
  categoryScheduleCancelReplay,
} from '../../taxonomy/index.js';

/** Direct registration keeps every private route visible in the isolation inventory. */
export function registerCategoryScheduleRoutes(router: Router): void {
  registerCategoryReads(router);
  registerCategoryScheduleReads(router);
  registerCategoryScheduleWrites(router);
}

function registerCategoryReads(router: Router): void {
  router.get(
    '/capture-categories',
    defaultRateLimit,
    authorize('Settings.Read', theEvent, { changes: ['C14'] }),
    requireCapability('config.manage'),
    validate({ query: CategoryActivityListQuery }),
    listCategoryActivityHandler,
  );
  router.get(
    '/capture-categories/:categoryId',
    defaultRateLimit,
    authorize('Settings.Read', theEvent, { changes: ['C14'] }),
    requireCapability('config.manage'),
    validate({ params: CategoryActivityParams, query: z.object({}).strict() }),
    getCategoryActivityHandler,
  );
}

function registerCategoryScheduleReads(router: Router): void {
  router.get(
    '/capture-categories/:categoryId/schedules',
    defaultRateLimit,
    authorize('Settings.Read', theEvent, { changes: ['C14'] }),
    requireCapability('config.manage'),
    validate({ params: CategoryActivityParams, query: CategoryScheduleListQuery }),
    listCategorySchedulesHandler,
  );
  router.get(
    '/capture-categories/:categoryId/schedules/:id',
    defaultRateLimit,
    authorize('Settings.Read', theEvent, { changes: ['C14'] }),
    requireCapability('config.manage'),
    validate({ params: CategoryScheduleParams, query: z.object({}).strict() }),
    getCategoryScheduleHandler,
  );
}

function registerCategoryScheduleWrites(router: Router): void {
  router.post(
    '/capture-categories/:categoryId/schedules',
    adminRateLimit,
    authorize('Schedule.Manage', theEvent),
    requireCapability('config.manage'),
    validate({
      params: CategoryActivityParams,
      body: CreateCategoryScheduleRequest,
      query: z.object({}).strict(),
    }),
    idempotent('taxonomy.category.schedule', { redacted: categoryScheduleCreateReplay }),
    createCategoryScheduleHandler,
  );
  router.patch(
    '/capture-categories/:categoryId/schedules/:id',
    adminRateLimit,
    authorize('Schedule.Manage', theEvent),
    requireCapability('config.manage'),
    validate({
      params: CategoryScheduleParams,
      body: UpdateCategoryScheduleRequest,
      query: z.object({}).strict(),
    }),
    idempotent('taxonomy.category.schedule.update', { redacted: categoryScheduleEditReplay }),
    updateCategoryScheduleHandler,
  );
  router.post(
    '/capture-categories/:categoryId/schedules/:id/cancel',
    adminRateLimit,
    authorize('Schedule.Manage', theEvent),
    requireCapability('config.manage'),
    validate({
      params: CategoryScheduleParams,
      body: CancelCategoryScheduleRequest,
      query: z.object({}).strict(),
    }),
    idempotent('taxonomy.category.schedule.cancel', { redacted: categoryScheduleCancelReplay }),
    cancelCategoryScheduleHandler,
  );
}
