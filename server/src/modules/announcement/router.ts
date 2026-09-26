import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CreateAnnouncementRequest, Id, ListAnnouncementsQuery } from '@spoh/shared';
import { getAuth, requireAuth } from '../../platform/identity/index.js';
import { defaultRateLimit } from '../../platform/http/rateLimit.js';
import { requireCapability } from '../../platform/access/index.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../platform/http/validate.js';
import { auditContextFrom } from '../../platform/http/auditContext.js';
import { acknowledgeAnnouncement, listInbox, sendAnnouncement } from './service.js';

/** Targeted announcements with acknowledgement tracking (BUILD_PLAN §7.2). */
export const announcementRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

announcementRouter.use(requireAuth);

/**
 * `announcement.station.send` is the floor: an IC may address their own
 * station. Whether the caller may go event-wide depends on the payload, so
 * that check lives in the service where the target is visible.
 */
announcementRouter.post(
  '/',
  defaultRateLimit,
  requireCapability('announcement.station.send'),
  validate({ body: CreateAnnouncementRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const body = validatedBody<CreateAnnouncementRequest>(req);
    const announcement = await sendAnnouncement(
      body,
      { volunteerId: auth.volunteerId, role: auth.role },
      auditContextFrom(req),
    );
    res.status(201).json({ announcement });
  },
);

/** The inbox. Scoped to the caller — everyone gets their own view. */
announcementRouter.get(
  '/',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ query: ListAnnouncementsQuery }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const query = validatedQuery<ListAnnouncementsQuery>(req);
    const announcements = await listInbox(query, {
      volunteerId: auth.volunteerId,
      role: auth.role,
    });

    res.status(200).json({
      data: announcements,
      meta: { count: announcements.length, nextCursor: announcements.at(-1)?.id ?? null },
    });
  },
);

announcementRouter.post(
  '/:id/ack',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ params: IdParams }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const announcement = await acknowledgeAnnouncement(id, auth.volunteerId);
    res.status(200).json({ announcement });
  },
);
