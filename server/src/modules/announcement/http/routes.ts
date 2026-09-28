import { Router } from 'express';
import { z } from 'zod';
import { CreateAnnouncementRequest, Id, ListAnnouncementsQuery } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/http/access.js';
import { validate } from '../../../platform/http/validate.js';
import { acknowledgeHandler, listInboxHandler, sendAnnouncementHandler } from './handlers.js';

/** Targeted announcements with acknowledgement tracking (BUILD_PLAN §7.2). */
export const announcementRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

announcementRouter.use(requireAuth);

/**
 * `announcement.station.send` is the floor: an IC may address their own
 * station. Whether the caller may go event-wide depends on the payload, so
 * that check lives in the use case where the target is visible.
 */
announcementRouter.post(
  '/',
  defaultRateLimit,
  requireCapability('announcement.station.send'),
  validate({ body: CreateAnnouncementRequest }),
  sendAnnouncementHandler,
);

/** The inbox. Scoped to the caller — everyone gets their own view. */
announcementRouter.get(
  '/',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ query: ListAnnouncementsQuery }),
  listInboxHandler,
);

announcementRouter.post(
  '/:id/ack',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ params: IdParams }),
  acknowledgeHandler,
);
