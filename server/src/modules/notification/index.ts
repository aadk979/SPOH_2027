/** The notification module's public API: the only file another module may import. */
export { notificationRouter } from './http/routes.js';
export { dispatch, type NotificationInput } from './application/dispatch.js';
export { TTL_SECONDS } from './domain/delivery.js';
export {
  sendDevicePush,
  type DevicePushInput,
  type DevicePushResult,
} from './application/sendDevicePush.js';
