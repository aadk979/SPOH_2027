import type { AnnouncementRecord } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { acknowledge, findAnnouncementById } from '../data/repo.js';
import { decorate } from './decorate.js';

export async function acknowledgeAnnouncement(
  announcementId: string,
  volunteerId: string,
): Promise<AnnouncementRecord> {
  const existing = await findAnnouncementById(announcementId);
  if (!existing) throw new NotFoundError('Announcement');

  await acknowledge(announcementId, volunteerId);

  const refreshed = await findAnnouncementById(announcementId);
  if (!refreshed) throw new NotFoundError('Announcement');

  return decorate(refreshed, volunteerId, null);
}
