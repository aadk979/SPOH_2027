import type { AnnouncementRecord, CreateAnnouncementRequest } from '@spoh/shared';
import type { AuditContext } from '../../../platform/audit/index.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findAnnouncementById } from '../data/repo.js';
import { decorate } from './decorate.js';
import { publishDirectAnnouncement } from './publishDirectAnnouncement.js';
import type { DirectSender } from './directSender.js';
export type { DirectSender } from './directSender.js';

/** Publication, personal notices and the sole urgent delivery plan commit together. */
export async function sendAnnouncement(request: CreateAnnouncementRequest, sender: DirectSender,
  audit: AuditContext): Promise<AnnouncementRecord> {
  const { announcement, audienceCount } = await publishDirectAnnouncement({ request, sender, audit });
  const created = await findAnnouncementById(sender.scope, announcement.id);
  if (!created) throw new NotFoundError('Announcement');
  return decorate(sender.scope, created, { viewerId: sender.volunteerId, audienceCount });
}
