/** The notification module's public API: the only file another module may import. */
export { notificationRouter } from './http/routes.js';
export { dispatch, type NotificationInput } from './application/dispatch.js';
export { TTL_SECONDS } from './domain/delivery.js';
export { queueNotices, materialiseNotices, type QueueNoticesInput } from './application/queueNotices.js';
export { activeNoticeAudience } from './data/noticeRecipientRepo.js';
export { createPersonNotificationRouter } from './http/centreRoutes.js';
export type { NoticeHistoryMaterialiser } from './application/readCentre.js';
export { createNoticeHistoryMaterialiser } from './application/materialiseHistory.js';
export { deliverNoticeBatch, executeNoticeDelivery } from './application/deliverNoticeBatch.js';
export {
  sendDevicePush,
  type DevicePushInput,
  type DevicePushResult,
} from './application/sendDevicePush.js';
