import { Router } from 'express';
import { CreateEventRequest, CloneEventWizardRequest } from '@spoh/shared';
import { adminRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { requirePerson } from '../../../platform/http/requireAuth.js';
import {
  listMyEventsHandler,
  eventAdministrationHandler,
  createEventHandler,
  cloneEventHandler,
} from './handlers.js';

/**
 * `/events` itself: the caller's events (ADR-001 §4). A platform route about
 * the person, so it needs a valid token but no membership of any one event.
 * The event-scoped surface `/events/:eventId/…` is mounted separately.
 */
export const eventListRouter: Router = Router();

eventListRouter.get('/', requirePerson, defaultRateLimit, listMyEventsHandler);
eventListRouter.get('/administration', requirePerson, defaultRateLimit, eventAdministrationHandler);
eventListRouter.post(
  '/',
  requirePerson,
  adminRateLimit,
  validate({ body: CreateEventRequest }),
  createEventHandler,
);
eventListRouter.post(
  '/clone',
  requirePerson,
  adminRateLimit,
  validate({ body: CloneEventWizardRequest }),
  cloneEventHandler,
);
