import type { AnnouncementPriority, NoticeKind, NotificationKind } from '@spoh/shared';

const PUSH_KIND: Readonly<Partial<Record<NoticeKind, NotificationKind>>> = {
  LOST_PERSON_RAISED: 'lostPerson.raised', LOST_PERSON_RESOLVED: 'lostPerson.resolved',
  ASSIGNMENT_CHANGED: 'assignment.changed', ASSIGNMENT_REMOVED: 'assignment.changed',
  SWAP_APPROVED: 'swap.decision', SWAP_REJECTED: 'swap.decision', SWAP_CANCELLED: 'swap.decision',
  FALLBACK_REMINDER: 'fallback.reminder', ARCHIVE_REMINDER: 'event.archiveReminder',
  INCIDENT_RAISED: 'incident.critical', GIFT_LOW_STOCK: 'gift.lowStock',
};

/** Urgent announcements retain their existing, single durable delivery owner. */
export function pushKind(kind: NoticeKind, priority: AnnouncementPriority): NotificationKind | null {
  if (priority === 'INFO') return null;
  if (kind === 'ANNOUNCEMENT_PUBLISHED')
    return priority === 'OPERATIONAL' ? 'announcement.operational' : null;
  return PUSH_KIND[kind] ?? null;
}

export function preferenceAllows(
  priority: AnnouncementPriority,
  preference: { urgentPush: boolean; operationalPush: boolean },
): boolean {
  return priority === 'URGENT' ? preference.urgentPush
    : priority === 'OPERATIONAL' && preference.operationalPush;
}

export function deliveryDeadline(input: { createdAt: Date; expiresAt?: Date | null; ttlSeconds: number }) {
  const ttl = input.createdAt.getTime() + input.ttlSeconds * 1000;
  return new Date(Math.min(ttl, input.expiresAt?.getTime() ?? ttl));
}
