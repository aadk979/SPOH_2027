import type { NoticeSourceReaders } from '../platform/notification/sourceReader.js';
import { readAnnouncementNoticeSource } from '../modules/announcement/index.js';
import { readLostPersonNoticeSource } from '../modules/lostPerson/index.js';
import { readAssignmentNoticeSource } from '../modules/assignments/index.js';
import { readSwapNoticeSource } from '../modules/shift/index.js';
import { readFallbackNoticeSource } from '../modules/fallback/index.js';
import { readArchiveNoticeSource } from '../modules/event/index.js';
import { readIncidentNoticeSource } from '../modules/incident/index.js';
import { readGiftNoticeSource } from '../modules/gift/index.js';

/** Source ownership stays in the source modules; composition is the only registry. */
export const noticeSourceReaders: NoticeSourceReaders = {
  ANNOUNCEMENT: readAnnouncementNoticeSource, LOST_PERSON: readLostPersonNoticeSource,
  ASSIGNMENT: readAssignmentNoticeSource, SWAP: readSwapNoticeSource,
  FALLBACK: readFallbackNoticeSource, EVENT: readArchiveNoticeSource,
  INCIDENT: readIncidentNoticeSource, GIFT: readGiftNoticeSource,
};
