import type { Request, Response } from 'express';
import type { AttendanceProof } from '@spoh/shared';
import { getAuth } from '../../../platform/http/requireAuth.js';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { attendanceStatus } from '../application/attendanceStatus.js';
import { issueChallenge } from '../application/issueChallenge.js';
import { startAttendance } from '../application/startAttendance.js';
import { submitAttendance } from '../application/submitAttendance.js';

export async function attendanceStatusHandler(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  res.json(
    await attendanceStatus({
      scope: { eventId: auth.eventId },
      volunteerId: auth.volunteerId,
      ip: req.ip,
    }),
  );
}

export async function startAttendanceHandler(req: Request, res: Response): Promise<void> {
  res.json({ attendance: await startAttendance(actorContextFrom(req)) });
}

export async function issueChallengeHandler(req: Request, res: Response): Promise<void> {
  res.json(await issueChallenge(actorContextFrom(req)));
}

export async function submitAttendanceHandler(req: Request, res: Response): Promise<void> {
  const proof = validatedBody<AttendanceProof>(req);
  res.json({ attendance: await submitAttendance(proof, actorContextFrom(req)) });
}
