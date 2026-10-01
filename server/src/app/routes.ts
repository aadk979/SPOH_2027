import { Router } from 'express';
import { attendanceRouter } from '../modules/attendance/index.js';
import { env } from '../config/env.js';
import { announcementRouter } from '../modules/announcement/index.js';
import { adminRouter } from '../modules/admin/index.js';
import { authRouter } from '../modules/auth/index.js';
import { mediaRouter } from '../modules/media/index.js';
import { notificationRouter } from '../modules/notification/index.js';
import { auditRouter } from '../modules/audit/index.js';
import { dashboardRouter } from '../modules/dashboard/index.js';
import { fallbackRouter } from '../modules/fallback/index.js';
import { footfallRouter } from '../modules/footfall/index.js';
import { giftRouter } from '../modules/gift/index.js';
import { incidentRouter } from '../modules/incident/index.js';
import { lostFoundRouter } from '../modules/lostFound/index.js';
import { lostPersonRouter } from '../modules/lostPerson/index.js';
import { meRouter } from '../modules/me/index.js';
import { missionCardRouter } from '../modules/missionCard/index.js';
import { registrationRouter } from '../modules/registration/index.js';
import { reportRouter } from '../modules/report/index.js';
import { visitorRouter } from '../modules/visitor/index.js';
import { rosterRouter } from '../modules/roster/index.js';
import { shiftRouter } from '../modules/shift/index.js';
import { stationRouter } from '../modules/station/index.js';
import { createDevAuthRouter } from '../modules/devAuth/index.js';
import { eventListRouter } from '../modules/event/index.js';
import { eventFromAlias, eventFromPath } from '../platform/http/eventContext.js';

/** A module's routes and where they are mounted under /api/v1. */
export interface ModuleRoutes {
  path: string;
  router: Router;
}

/**
 * Platform routes (ADR-001 §4): about the person and their session, outside
 * any event. The only routes inside `/api/v1` reachable without a bearer
 * token are here — opening a session is how you get one — and they carry
 * their own origin check and the sensitive rate limit instead.
 */
export const PLATFORM_ROUTES: readonly ModuleRoutes[] = [
  { path: '/auth', router: authRouter },
  // The caller's events, for the client's picker and switcher.
  { path: '/events', router: eventListRouter },
  // Development sign-in. The factory returns an empty router outside
  // AUTH_PROVIDER=local, so the path simply 404s in every deployed environment.
  ...(env.AUTH_PROVIDER === 'local' ? [{ path: '/dev-auth', router: createDevAuthRouter() }] : []),
];

/**
 * The event's API surface (BUILD_PLAN §7.1): every module and its path, in
 * mount order, served under `/api/v1/events/:eventId` (ADR-001 §4).
 *
 * Every router mounts `requireAuth` itself — default deny, with `/healthz` and
 * `/readyz` mounted outside this surface as the only unauthenticated routes in
 * the system — and authentication resolves the caller's membership of the
 * path's event.
 */
export const EVENT_ROUTES: readonly ModuleRoutes[] = [
  { path: '/me', router: meRouter },
  { path: '/attendance', router: attendanceRouter },
  { path: '/stations', router: stationRouter },
  { path: '/registrations', router: registrationRouter },
  { path: '/footfall', router: footfallRouter },
  { path: '/incidents', router: incidentRouter },
  { path: '/lost-person', router: lostPersonRouter },
  { path: '/roster', router: rosterRouter },
  // Swaps, briefing waves and gaps share the roster path: one people-and-shifts surface, split
  // across two modules only because they were built in different phases.
  { path: '/roster', router: shiftRouter },
  { path: '/cards', router: missionCardRouter },
  { path: '/gifts', router: giftRouter },
  { path: '/announcements', router: announcementRouter },
  { path: '/dashboard', router: dashboardRouter },
  { path: '/lost-found', router: lostFoundRouter },
  { path: '/reports', router: reportRouter },
  // Visitor values in allowlist mode, read by each field's reader roles (ADR-002 §4).
  { path: '/visitors', router: visitorRouter },
  { path: '/audit', router: auditRouter },
  // People, places, days, gift types and the runtime tuning values. Split by capability inside
  // the router rather than by path.
  { path: '/admin', router: adminRouter },
  // Push registration. Delivery is best effort; the polls remain the contract.
  { path: '/notifications', router: notificationRouter },
  // Presigned S3 access. The file itself never passes through this API.
  { path: '/media', router: mediaRouter },
  // Fallback declarations and the reconciliation imports live together: the import only makes
  // sense in the context of the window it is recovering from.
  { path: '/fallback', router: fallbackRouter },
];

/**
 * The /api/v1 router: platform routes, then the event surface under
 * `/events/:eventId`, then the same surface at its pre-P09.7 paths as aliases
 * of Event #1's (ADR-009 §6) until P16.7 removes them.
 */
export function createApiRouter(): Router {
  const api = Router();
  for (const { path, router } of PLATFORM_ROUTES) api.use(path, router);

  const event = Router({ mergeParams: true });
  for (const { path, router } of EVENT_ROUTES) event.use(path, router);
  api.use('/events/:eventId', eventFromPath, event);

  for (const { path, router } of EVENT_ROUTES) api.use(path, eventFromAlias, router);
  return api;
}
