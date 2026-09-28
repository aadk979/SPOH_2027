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
import { rosterRouter } from '../modules/roster/index.js';
import { shiftRouter } from '../modules/shift/index.js';
import { stationRouter } from '../modules/station/index.js';
import { createDevAuthRouter } from '../modules/devAuth/index.js';

/** A module's routes and where they are mounted under /api/v1. */
export interface ModuleRoutes {
  path: string;
  router: Router;
}

/**
 * The versioned API surface (BUILD_PLAN §7.1): every module and its path, in
 * mount order.
 *
 * Every router mounts `requireAuth` itself — default deny, with `/healthz` and
 * `/readyz` mounted outside this surface as the only unauthenticated routes in
 * the system.
 */
export const MODULE_ROUTES: readonly ModuleRoutes[] = [
  /**
   * Session lifecycle. The only routes inside `/api/v1` that are reachable
   * without a bearer token — opening a session is how you get one. They carry
   * their own origin check and the sensitive rate limit instead.
   */
  { path: '/auth', router: authRouter },
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
  // Development sign-in. The factory returns an empty router outside
  // AUTH_PROVIDER=local, so the path simply 404s in every deployed environment.
  ...(env.AUTH_PROVIDER === 'local' ? [{ path: '/dev-auth', router: createDevAuthRouter() }] : []),
];

/** The /api/v1 router: each module mounted at its path. */
export function createApiRouter(): Router {
  const api = Router();
  for (const { path, router } of MODULE_ROUTES) api.use(path, router);
  return api;
}
