import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import {
  self,
  fromParam,
  announcementTarget,
  anyStation,
} from '../../../platform/http/authorizeResources.js';
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
  UpdateAnnouncementPublicationScheduleRequest,
  CancelAnnouncementPublicationScheduleRequest,
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
  listPublicationSchedulesHandler,
  updatePublicationScheduleHandler,
  cancelPublicationScheduleHandler,
} from './publicationScheduleHandlers.js';
import { publicationScheduleReplay } from './publicationScheduleReplay.js';
import { acknowledgeHandler, listInboxHandler, sendAnnouncementHandler } from './handlers.js';

/** Targeted announcements with acknowledgement tracking (BUILD_PLAN §7.2). */
export const announcementRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();
const ScheduleParams = z.object({ id: Id, scheduleId: Id }).strict();

announcementRouter.use(requireAuth);
announcementRouter.use('/drafts', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

announcementRouter.post(
  '/drafts',
  defaultRateLimit,
  authorizeAll('Announcement.SendStation', anyStation('Announcement.SendStation'), {
    changes: ['C4'],
    any: true,
  }),
  requireCapability('announcement.station.send'),
  validate({ body: CreateAnnouncementDraftRequest }),
  idempotent('announcement.draft.create', { redacted: draftReplay }),
  createDraftHandler,
);
announcementRouter.get(
  '/drafts',
  defaultRateLimit,
  authorizeAll('Announcement.SendStation', anyStation('Announcement.SendStation'), {
    changes: ['C4'],
    any: true,
  }),
  requireCapability('announcement.station.send'),
  validate({ query: PaginationQuery.strict() }),
  listDraftsHandler,
);
announcementRouter.get(
  '/drafts/:id',
  defaultRateLimit,
  authorizeAll('Announcement.SendStation', anyStation('Announcement.SendStation'), {
    changes: ['C4'],
    any: true,
  }),
  requireCapability('announcement.station.send'),
  validate({ params: IdParams }),
  readDraftHandler,
);
announcementRouter.put(
  '/drafts/:id',
  defaultRateLimit,
  authorizeAll('Announcement.SendStation', anyStation('Announcement.SendStation'), {
    changes: ['C4'],
    any: true,
  }),
  requireCapability('announcement.station.send'),
  validate({ params: IdParams, body: UpdateAnnouncementDraftRequest }),
  updateDraftHandler,
);
announcementRouter.post(
  '/drafts/:id/schedules',
  defaultRateLimit,
  authorizeAll('Announcement.SendStation', anyStation('Announcement.SendStation'), {
    changes: ['C4'],
    any: true,
  }),
  requireCapability('announcement.station.send'),
  validate({ params: IdParams, body: ScheduleAnnouncementDraftRequest }),
  idempotent('announcement.schedule.create', { redacted: publicationScheduleReplay }),
  createPublicationScheduleHandler,
);
announcementRouter.get(
  '/drafts/:id/schedules/:scheduleId',
  defaultRateLimit,
  authorizeAll('Announcement.SendStation', anyStation('Announcement.SendStation'), {
    changes: ['C4'],
    any: true,
  }),
  requireCapability('announcement.station.send'),
  validate({ params: ScheduleParams }),
  readPublicationScheduleHandler,
);
announcementRouter.get(
  '/drafts/:id/schedules',
  defaultRateLimit,
  authorizeAll('Announcement.SendStation', anyStation('Announcement.SendStation'), {
    changes: ['C4'],
    any: true,
  }),
  requireCapability('announcement.station.send'),
  validate({ params: IdParams, query: PaginationQuery.strict() }),
  listPublicationSchedulesHandler,
);
announcementRouter.put(
  '/drafts/:id/schedules/:scheduleId',
  defaultRateLimit,
  authorizeAll('Announcement.SendStation', anyStation('Announcement.SendStation'), {
    changes: ['C4'],
    any: true,
  }),
  requireCapability('announcement.station.send'),
  validate({ params: ScheduleParams, body: UpdateAnnouncementPublicationScheduleRequest }),
  updatePublicationScheduleHandler,
);
announcementRouter.post(
  '/drafts/:id/schedules/:scheduleId/cancel',
  defaultRateLimit,
  authorizeAll('Announcement.SendStation', anyStation('Announcement.SendStation'), {
    changes: ['C4'],
    any: true,
  }),
  requireCapability('announcement.station.send'),
  validate({ params: ScheduleParams, body: CancelAnnouncementPublicationScheduleRequest }),
  cancelPublicationScheduleHandler,
);

/**
 * `announcement.station.send` is the floor: an IC may address their own
 * station. Whether the caller may go event-wide depends on the payload, so
 * that check lives in the use case where the target is visible.
 */
announcementRouter.post(
  '/',
  defaultRateLimit,
  authorizeAll('Announcement.Send', announcementTarget, { changes: ['C4'] }),
  requireCapability('announcement.station.send'),
  validate({ body: CreateAnnouncementRequest }),
  sendAnnouncementHandler,
);

/** The inbox. Scoped to the caller — everyone gets their own view. */
announcementRouter.get(
  '/',
  defaultRateLimit,
  authorize('Self.Read', self),
  requireCapability('own.read'),
  validate({ query: ListAnnouncementsQuery }),
  listInboxHandler,
);

announcementRouter.post(
  '/:id/ack',
  defaultRateLimit,
  authorize('Announcement.Ack', fromParam('Announcement'), { changes: ['C2'] }),
  requireCapability('own.read'),
  validate({ params: IdParams }),
  acknowledgeHandler,
);
