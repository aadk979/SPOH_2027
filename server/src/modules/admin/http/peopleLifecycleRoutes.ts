import type { Router } from 'express';
import { z } from 'zod';
import { BulkPeopleRequest, Id } from '@spoh/shared';
import { authorize } from '../../../platform/http/authorize.js';
import { memberFromPersonParam, theEvent } from '../../../platform/http/authorizeResources.js';
import { adminRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import {
  bulkPeopleHandler,
  resendInviteHandler,
  signOutPersonHandler,
} from '../../people/index.js';
import { optionalIdempotent } from '../../../platform/http/optionalIdempotency.js';

export function registerPeopleLifecycleRoutes(router: Router) {
  const params = z.object({ id: Id }).strict();
  router.post(
    '/volunteers/bulk',
    adminRateLimit,
    authorize('People.Read', theEvent),
    validate({ body: BulkPeopleRequest }),
    optionalIdempotent('people.bulk'),
    bulkPeopleHandler,
  );
  router.post(
    '/volunteers/:id/resend-invite',
    adminRateLimit,
    authorize('People.Update', memberFromPersonParam()),
    validate({ params }),
    optionalIdempotent('people.resend'),
    resendInviteHandler,
  );
  router.post(
    '/volunteers/:id/sign-out',
    adminRateLimit,
    authorize('People.Deactivate', memberFromPersonParam()),
    validate({ params }),
    optionalIdempotent('people.signOut'),
    signOutPersonHandler,
  );
}
