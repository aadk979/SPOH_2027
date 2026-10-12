import { createReadContext } from '../../../platform/access/currentRead.js';
import type { NoticeHistoryReader } from '../../../platform/notification/historyReader.js';
import { currentNoticeEvents, currentNoticeStanding } from '../data/noticeStandingRepo.js';
import type { NoticeHistoryMaterialiser } from './readCentre.js';

const MAX_EVENTS = 25;

/** Source modules own eligibility. The root supplies them without a module cycle. */
export function createNoticeHistoryMaterialiser(input: { readers: readonly NoticeHistoryReader[] }): NoticeHistoryMaterialiser {
  return async (db, request) => {
    const events = await currentNoticeEvents(db, request);
    let complete = events.length <= MAX_EVENTS;
    for (const event of events.slice(0, MAX_EVENTS)) {
      const scope = { eventId: event.id };
      const standing = await currentNoticeStanding(scope, { db, personId: request.personId });
      const member = standing?.memberships[0];
      if (!member) continue;
      const context = createReadContext({ scope, personId: request.personId,
        membershipId: member.id, now: request.now, db });
      for (const read of input.readers) {
        const result = await read(context);
        complete = result.complete && complete;
      }
    }
    return { complete };
  };
}
