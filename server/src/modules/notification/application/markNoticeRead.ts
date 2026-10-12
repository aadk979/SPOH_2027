import { prisma } from '../../../platform/db/client.js';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { ownNotice, markOwnNoticeRead } from '../data/noticeCentreRepo.js';
import { currentNoticeEvents } from '../data/noticeStandingRepo.js';
import { projectNotice } from './noticeProjection.js';
import type { CentreReader } from './readCentre.js';

/** A notice read never writes an announcement or lost-person acknowledgement. */
export function markNoticeRead(id: string, actor: CentreReader & { audit: AuditContext }) {
  return prisma.$transaction(async (tx) => {
    const events = await currentNoticeEvents(tx, { personId: actor.personId });
    const row = await ownNotice({ eventIds: events.map((event) => event.id) }, { db: tx,
      personId: actor.personId, id });
    if (!row) throw new NotFoundError('Notification');
    const now = (actor.clock ?? systemClock).now();
    const data = await projectNotice({ row, db: tx, now, sourceReaders: actor.sourceReaders });
    if (!data) throw new NotFoundError('Notification');
    const changed = await markOwnNoticeRead({ eventId: row.eventId }, { tx, personId: actor.personId, id, now });
    if (changed.count) await writeAudit(tx, { ...actor.audit, eventId: row.eventId,
      action: 'notification.read', entityType: 'Notice', entityId: id, after: { read: true } });
    const current = await ownNotice({ eventIds: [row.eventId] }, { db: tx, personId: actor.personId, id });
    return { data: { ...data, readAt: current!.readAt!.toISOString() } };
  });
}
