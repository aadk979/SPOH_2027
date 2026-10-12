import { createNoticeHistoryMaterialiser } from '../modules/notification/index.js';
import { materialiseAnnouncementNoticeHistory } from '../modules/announcement/index.js';
import { materialiseLostPersonNoticeHistory } from '../modules/lostPerson/index.js';

export const noticeHistoryMaterialiser = createNoticeHistoryMaterialiser({
  readers: [materialiseAnnouncementNoticeHistory, materialiseLostPersonNoticeHistory],
});
