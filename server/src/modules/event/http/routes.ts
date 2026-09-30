import { Router } from 'express';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requirePerson } from '../../../platform/http/requireAuth.js';
import { listMyEventsHandler } from './handlers.js';

/**
 * `/events` itself: the caller's events (ADR-001 §4). A platform route about
 * the person, so it needs a valid token but no membership of any one event.
 * The event-scoped surface `/events/:eventId/…` is mounted separately.
 */
export const eventListRouter: Router = Router();

eventListRouter.get('/', requirePerson, defaultRateLimit, listMyEventsHandler);
