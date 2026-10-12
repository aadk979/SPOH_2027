import { NoticeContext } from '@spoh/shared';
import type { NoticeSourceInput, NoticeSourceReaders } from '../../../platform/notification/sourceReader.js';
import { createReadContext } from '../../../platform/access/currentRead.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { currentNoticeStanding } from '../data/noticeStandingRepo.js';

function membershipForSource(input: { kind: NoticeSourceInput['kind'];
  member: { id: string; status: string } | undefined }) {
  const { member, kind } = input;
  return member && (kind !== 'ARCHIVE_REMINDER' || member.status === 'ACTIVE') ? { membershipId: member.id } : {};
}

export async function readNoticeSource(input: {
  eventId: string; row: NoticeSourceInput; db: PrismaTransactionClient;
  now: Date; sourceReaders: NoticeSourceReaders;
}) {
  const { row, db, now } = input;
  if (row.expiresAt && row.expiresAt <= now) return null;
  const context = NoticeContext.parse(row.context);
  const event = await currentNoticeStanding({ eventId: input.eventId }, { db,
    personId: row.recipientPersonId });
  if (!event) return null;
  const member = event.memberships[0];
  if (row.kind === 'ARCHIVE_REMINDER') {
    if (!event.organisation.memberships.length) return null;
  } else if (!member || !['ACTIVE', 'ENDED'].includes(member.status)) return null;
  const readContext = createReadContext({ scope: { eventId: input.eventId },
    personId: row.recipientPersonId,
    ...membershipForSource({ kind: row.kind, member }),
    now, db });
  const source = await input.sourceReaders[row.source.kind](readContext, { ...row, context });
  return source ? { source, event } : null;
}
