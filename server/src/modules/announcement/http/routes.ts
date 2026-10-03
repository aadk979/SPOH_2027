import { Router } from 'express';
import { z } from 'zod';
import {
  CreateAnnouncementRequest,
  CreateAnnouncementDraftRequest,
  Id,
  ListAnnouncementsQuery,
  PaginationQuery,
  UpdateAnnouncementDraftRequest,
  ScheduleAnnouncementDraftRequest,
} from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/http/access.js';
import { validate } from '../../../platform/http/validate.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import {
  createDraftHandler,
  listDraftsHandler,
  readDraftHandler,
  updateDraftHandler,
} from './draftHandlers.js';
import { draftReplay } from './draftReplay.js';
import {
  createPublicationScheduleHandler,
  readPublicationScheduleHandler,
} from './publicationScheduleHandlers.js';
import { publicationScheduleReplay } from './publicationScheduleReplay.js';
import { acknowledgeHandler, listInboxHandler, sendAnnouncementHandler } from './handlers.js';

/** Targeted announcements with acknowledgement tracking (BUILD_PLAN §7.2). */
export const announcementRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

announcementRouter.use(requireAuth);
announcementRouter.use('/drafts', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

announcementRouter.post(
  '/drafts',
  defaultRateLimit,
  requireCapability('announcement.station.send'),
  validate({ body: CreateAnnouncementDraftRequest }),
  idempotent('announcement.draft.create', { redacted: draftReplay }),
  createDraftHandler,
);
announcementRouter.get(
  '/drafts',
  defaultRateLimit,
  requireCapability('announcement.station.send'),
  validate({ query: PaginationQuery.strict() }),
  listDraftsHandler,
);
announcementRouter.get(
  '/drafts/:id',
  defaultRateLimit,
  requireCapability('announcement.station.send'),
  validate({ params: IdParams }),
  readDraftHandler,
);
announcementRouter.put(
  '/drafts/:id',
  defaultRateLimit,
  requireCapability('announcement.station.send'),
  validate({ params: IdParams, body: UpdateAnnouncementDraftRequest }),
  updateDraftHandler,
);
announcementRouter.post(
  '/drafts/:id/schedules',
  defaultRateLimit,
  requireCapability('announcement.station.send'),
  validate({ params: IdParams, body: ScheduleAnnouncementDraftRequest }),
  idempotent('announcement.schedule.create', { redacted: publicationScheduleReplay }),
  createPublicationScheduleHandler,
);
announcementRouter.get(
  '/drafts/:id/schedules/:scheduleId',
  defaultRateLimit,
  requireCapability('announcement.station.send'),
  validate({ params: z.object({ id: Id, scheduleId: Id }).strict() }),
  readPublicationScheduleHandler,
);

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
