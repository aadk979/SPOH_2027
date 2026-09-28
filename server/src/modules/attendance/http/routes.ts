import { Router } from 'express';
import { AttendanceProof } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit, sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import {
  attendanceStatusHandler,
  issueChallengeHandler,
  startAttendanceHandler,
  submitAttendanceHandler,
} from './handlers.js';

export const attendanceRouter: Router = Router();
attendanceRouter.use(requireAuth, function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
});
attendanceRouter.get('/', defaultRateLimit, attendanceStatusHandler);
attendanceRouter.post('/start', sensitiveRateLimit, startAttendanceHandler);
attendanceRouter.post('/challenge', sensitiveRateLimit, issueChallengeHandler);
attendanceRouter.post(
  '/submit',
  sensitiveRateLimit,
  validate({ body: AttendanceProof }),
  submitAttendanceHandler,
);
