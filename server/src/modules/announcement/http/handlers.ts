import type { Request, Response } from 'express';
import type { CreateAnnouncementRequest, ListAnnouncementsQuery } from '@spoh/shared';
import { actorContextFrom, auditContextFrom } from '../../../platform/http/auditContext.js';
import { getAuth } from '../../../platform/identity/index.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { acknowledgeAnnouncement } from '../application/acknowledgeAnnouncement.js';
import { listInbox } from '../application/listInbox.js';
import { sendAnnouncement } from '../application/sendAnnouncement.js';

export async function sendAnnouncementHandler(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  const body = validatedBody<CreateAnnouncementRequest>(req);
  const announcement = await sendAnnouncement(
    body,
    { volunteerId: auth.volunteerId, role: auth.role },
    auditContextFrom(req),
  );
  res.status(201).json({ announcement });
}

export async function listInboxHandler(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  const query = validatedQuery<ListAnnouncementsQuery>(req);
  const page = await listInbox(query, { volunteerId: auth.volunteerId, role: auth.role });
  res.status(200).json({
    data: page.data,
    meta: { count: page.data.length, nextCursor: page.nextCursor },
  });
}

export async function acknowledgeHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const reader = { ...actorContextFrom(req), role: getAuth(req).role };
  const announcement = await acknowledgeAnnouncement(id, reader);
  res.status(200).json({ announcement });
}
