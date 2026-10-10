import { Router } from 'express';
import { z } from 'zod';
import { ChangeRolePermissionRequest, Id, SimulatePermissionRequest } from '@spoh/shared';
import { authorize } from '../../../platform/http/authorize.js';
import { theEvent } from '../../../platform/http/authorizeResources.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import { adminRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { validate } from '../../../platform/http/validate.js';
import {
  changeRolePermissionHandler,
  readMemberPermissionsHandler,
  readRolePermissionsHandler,
  simulatePermissionHandler,
} from './handlers.js';

/**
 * The event's role permissions (P11.7). Reading them, and asking the simulator, is reading the
 * event's configuration; changing a grant is `Permissions.Edit`, which only platform admins hold.
 */
export const permissionsRouter: Router = Router();
permissionsRouter.use(requireAuth);

permissionsRouter.get(
  '/',
  defaultRateLimit,
  authorize('Settings.Read', theEvent),
  readRolePermissionsHandler,
);

permissionsRouter.put(
  '/',
  adminRateLimit,
  authorize('Permissions.Edit', theEvent),
  validate({ body: ChangeRolePermissionRequest }),
  idempotent('PUT /permissions'),
  changeRolePermissionHandler,
);

permissionsRouter.post(
  '/simulate',
  defaultRateLimit,
  authorize('Settings.Read', theEvent),
  validate({ body: SimulatePermissionRequest }),
  simulatePermissionHandler,
);

permissionsRouter.get(
  '/people/:personId',
  defaultRateLimit,
  authorize('Settings.Read', theEvent),
  validate({ params: z.object({ personId: Id }).strict() }),
  readMemberPermissionsHandler,
);
