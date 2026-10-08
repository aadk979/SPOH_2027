import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import { self, today } from '../../../platform/http/authorizeResources.js';
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
attendanceRouter.get('/', defaultRateLimit, authorize('Self.Read', self), attendanceStatusHandler);
attendanceRouter.post(
  '/start',
  sensitiveRateLimit,
  authorizeAll('Attendance.Submit', today('Attendance.Submit')),
  startAttendanceHandler,
);
attendanceRouter.post(
  '/challenge',
  sensitiveRateLimit,
  authorizeAll('Attendance.IssueCode', today('Attendance.IssueCode')),
  issueChallengeHandler,
);
attendanceRouter.post(
  '/submit',
  sensitiveRateLimit,
  authorizeAll('Attendance.Submit', today('Attendance.Submit')),
  validate({ body: AttendanceProof }),
  submitAttendanceHandler,
);
