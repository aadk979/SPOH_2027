import { Router, type Request, type Response } from 'express';
import { CheckInRequest } from '@spoh/shared';
import { getAuth, requireAuth } from '../../middleware/auth/index.js';
import { requireCapability } from '../../middleware/rbac.js';
import { validate, validatedBody } from '../../middleware/validate.js';
import { auditContextFrom } from '../../lib/requestContext.js';
import { checkIn, checkOut, getMe } from './service.js';

/** Caller profile and shift attendance (BUILD_PLAN §7.2). */
export const meRouter: Router = Router();

meRouter.use(requireAuth);

meRouter.get('/', requireCapability('own.read'), async (req: Request, res: Response) => {
  const auth = getAuth(req);
  res.status(200).json(await getMe(auth.volunteerId));
});

meRouter.post(
  '/check-in',
  requireCapability('own.read'),
  validate({ body: CheckInRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { assignmentId } = validatedBody<CheckInRequest>(req);
    const assignment = await checkIn(auth.volunteerId, assignmentId, auditContextFrom(req));
    res.status(200).json({ assignment });
  },
);

meRouter.post(
  '/check-out',
  requireCapability('own.read'),
  validate({ body: CheckInRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { assignmentId } = validatedBody<CheckInRequest>(req);
    const assignment = await checkOut(auth.volunteerId, assignmentId, auditContextFrom(req));
    res.status(200).json({ assignment });
  },
);
