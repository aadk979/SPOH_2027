import type { AnnouncementPriority } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { eventDayAnchorOf } from '../../../platform/time/index.js';
import { queueNotices } from '../../notification/index.js';
import { findDeliveryRecipients, lockDeliveryEvent } from '../data/deliveryPlanRepo.js';
import { audienceOf, type Audience } from '../domain/audience.js';

export async function queuePublicationNotices(tx: PrismaTransactionClient, scope: EventScope, input: {
  announcement: Audience & { id: string; priority: AnnouncementPriority; expiresAt: Date | null }; now: Date;
}) {
  const event = await lockDeliveryEvent(scope, tx);
  const recipients = await findDeliveryRecipients(scope, { tx,
    audience: input.announcement, today: eventDayAnchorOf(input.now, event) });
  await queueNotices(tx, scope, { kind: 'ANNOUNCEMENT_PUBLISHED', priority: input.announcement.priority,
    source: { kind: 'ANNOUNCEMENT', id: input.announcement.id },
    transitionKey: `announcement:${input.announcement.id}:published`, context: { type: 'announcement' },
    recipientPersonIds: recipients.map((member) => member.personId), createdAt: input.now,
    expiresAt: input.announcement.expiresAt });
  return recipients.length;
}
export const publicationAudience = audienceOf;
