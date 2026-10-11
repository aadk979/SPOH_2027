import type { Router } from 'express';
import { z } from 'zod';
import {
  Id,
  CreateStationTypeRequest,
  UpdateStationTypeRequest,
  CreateStationTagRequest,
  UpdateStationTagRequest,
  CreateCaptureCategoryRequest,
  UpdateCaptureCategoryRequest,
  CreateManagedTemplateRequest,
  UpdateManagedTemplateRequest,
  UpdateShiftExceptionRequest,
} from '@spoh/shared';
import { authorize } from '../../../platform/http/authorize.js';
import { theEvent } from '../../../platform/http/authorizeResources.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import { validate } from '../../../platform/http/validate.js';
import { adminRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import * as handlers from './handlers.js';
import { RemoveEventDayRequest } from '@spoh/shared';

const Params = z.object({ id: Id }).strict();
export function registerStructureRoutes(router: Router) {
  router.use('/structure', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get(
    '/structure',
    defaultRateLimit,
    authorize('Structure.Read', theEvent),
    handlers.structureHandler,
  );
  registerTypes(router);
  registerTags(router);
  registerCategories(router);
  registerTemplates(router);
  router.delete(
    '/structure/days/:id',
    adminRateLimit,
    authorize('Structure.Change', theEvent, { changes: ['C15'] }),
    validate({ params: Params, body: RemoveEventDayRequest }),
    idempotent('structure.day.remove'),
    handlers.removeDayHandler,
  );
  router.patch(
    '/structure/shifts/:id',
    adminRateLimit,
    authorize('Structure.Edit', theEvent),
    validate({ params: Params, body: UpdateShiftExceptionRequest }),
    idempotent('structure.shift.exception'),
    handlers.editShiftHandler,
  );
}
function registerTypes(router: Router) {
  router.post(
    '/structure/types',
    adminRateLimit,
    authorize('Structure.Change', theEvent, { changes: ['C15'] }),
    validate({ body: CreateStationTypeRequest }),
    idempotent('structure.type.create'),
    handlers.createTypeHandler,
  );
  router.patch(
    '/structure/types/:id',
    adminRateLimit,
    authorize('Structure.Edit', theEvent),
    validate({ params: Params, body: UpdateStationTypeRequest }),
    idempotent('structure.type.update'),
    handlers.editTypeHandler,
  );
}
function registerTags(router: Router) {
  router.post(
    '/structure/tags',
    adminRateLimit,
    authorize('Structure.Change', theEvent, { changes: ['C15'] }),
    validate({ body: CreateStationTagRequest }),
    idempotent('structure.tag.create'),
    handlers.createTagHandler,
  );
  router.patch(
    '/structure/tags/:id',
    adminRateLimit,
    authorize('Structure.Edit', theEvent),
    validate({ params: Params, body: UpdateStationTagRequest }),
    idempotent('structure.tag.update'),
    handlers.editTagHandler,
  );
}
function registerCategories(router: Router) {
  router.post(
    '/structure/categories',
    adminRateLimit,
    authorize('Structure.Change', theEvent, { changes: ['C15'] }),
    validate({ body: CreateCaptureCategoryRequest }),
    idempotent('structure.category.create'),
    handlers.createCategoryHandler,
  );
  router.patch(
    '/structure/categories/:id',
    adminRateLimit,
    authorize('Structure.Edit', theEvent),
    validate({ params: Params, body: UpdateCaptureCategoryRequest }),
    idempotent('structure.category.update'),
    handlers.editCategoryHandler,
  );
}
function registerTemplates(router: Router) {
  router.post(
    '/structure/templates',
    adminRateLimit,
    authorize('Structure.Change', theEvent, { changes: ['C15'] }),
    validate({ body: CreateManagedTemplateRequest }),
    idempotent('structure.template.create'),
    handlers.createTemplateHandler,
  );
  router.patch(
    '/structure/templates/:id',
    adminRateLimit,
    authorize('Structure.Edit', theEvent),
    validate({ params: Params, body: UpdateManagedTemplateRequest }),
    idempotent('structure.template.update'),
    handlers.editTemplateHandler,
  );
}
