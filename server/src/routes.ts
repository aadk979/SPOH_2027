import { Router } from 'express';
import { attendanceRouter } from './modules/attendance/index.js';
import { env } from './config/env.js';
import { announcementRouter } from './modules/announcement/index.js';
import { adminRouter } from './modules/admin/index.js';
import { authRouter } from './modules/auth/index.js';
import { mediaRouter } from './modules/media/index.js';
import { notificationRouter } from './modules/notification/index.js';
import { auditRouter } from './modules/audit/index.js';
import { dashboardRouter } from './modules/dashboard/index.js';
import { fallbackRouter } from './modules/fallback/index.js';
import { footfallRouter } from './modules/footfall/index.js';
import { giftRouter } from './modules/gift/index.js';
import { incidentRouter } from './modules/incident/index.js';
import { lostFoundRouter } from './modules/lostFound/index.js';
import { lostPersonRouter } from './modules/lostPerson/index.js';
import { meRouter } from './modules/me/index.js';
import { missionCardRouter } from './modules/missionCard/index.js';
import { registrationRouter } from './modules/registration/index.js';
import { reportRouter } from './modules/report/router.js';
import { rosterRouter } from './modules/roster/index.js';
import { shiftRouter } from './modules/shift/index.js';
import { stationRouter } from './modules/station/index.js';
import { createDevAuthRouter } from './modules/devAuth/router.js';

/**
 * The versioned API surface (BUILD_PLAN §7.1).
 *
 * Every router below mounts `requireAuth` itself — default deny, with
 * `/healthz` and `/readyz` mounted outside this router as the only
 * unauthenticated routes in the system.
 */
export const apiRouter: Router = Router();

/**
 * Session lifecycle. The only routes inside `/api/v1` that are reachable
 * without a bearer token — opening a session is how you get one. They carry
 * their own origin check and the sensitive rate limit instead.
 */
apiRouter.use('/auth', authRouter);

apiRouter.use('/me', meRouter);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/stations', stationRouter);
apiRouter.use('/registrations', registrationRouter);
apiRouter.use('/footfall', footfallRouter);
apiRouter.use('/incidents', incidentRouter);
apiRouter.use('/lost-person', lostPersonRouter);
apiRouter.use('/roster', rosterRouter);
// Swaps, briefing waves and gaps share the roster path: one people-and-shifts
// surface, split across two modules only because they were built in different
// phases.
apiRouter.use('/roster', shiftRouter);
apiRouter.use('/cards', missionCardRouter);
apiRouter.use('/gifts', giftRouter);
apiRouter.use('/announcements', announcementRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/lost-found', lostFoundRouter);
apiRouter.use('/reports', reportRouter);
apiRouter.use('/audit', auditRouter);
// People, places, days, gift types and the runtime tuning values. Split by
// capability inside the router rather than by path.
apiRouter.use('/admin', adminRouter);
// Push registration. Delivery is best effort; the polls remain the contract.
apiRouter.use('/notifications', notificationRouter);
// Presigned S3 access. The file itself never passes through this API.
apiRouter.use('/media', mediaRouter);
// Fallback declarations and the reconciliation imports live together: the
// import only makes sense in the context of the window it is recovering from.
apiRouter.use('/fallback', fallbackRouter);

// Development sign-in. The factory returns an empty router outside
// AUTH_PROVIDER=local, so the path simply 404s in every deployed environment.
if (env.AUTH_PROVIDER === 'local') {
  apiRouter.use('/dev-auth', createDevAuthRouter());
}
