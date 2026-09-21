import { Router } from 'express';
import { AttendanceProof } from '@spoh/shared';
import { getAuth, requireAuth } from '../../middleware/auth/index.js';
import { defaultRateLimit, sensitiveRateLimit } from '../../middleware/rateLimit.js';
import { validate, validatedBody } from '../../middleware/validate.js';
import { auditContextFrom } from '../../lib/requestContext.js';
import { attendanceStatus, issueChallenge, startAttendance, submitAttendance } from './service.js';

export const attendanceRouter: Router = Router();
attendanceRouter.use(requireAuth, (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
attendanceRouter.get('/', defaultRateLimit, async (req, res) => {
  res.json(await attendanceStatus(getAuth(req).volunteerId, req.ip));
});
attendanceRouter.post('/start', sensitiveRateLimit, async (req, res) => {
  res.json({ attendance: await startAttendance(getAuth(req).volunteerId, auditContextFrom(req)) });
});
attendanceRouter.post('/challenge', sensitiveRateLimit, async (req, res) => {
  res.json(await issueChallenge(getAuth(req).volunteerId, auditContextFrom(req)));
});
attendanceRouter.post(
  '/submit',
  sensitiveRateLimit,
  validate({ body: AttendanceProof }),
  async (req, res) => {
    res.json({
      attendance: await submitAttendance(
        getAuth(req).volunteerId,
        validatedBody<AttendanceProof>(req),
        auditContextFrom(req),
      ),
    });
  },
);
