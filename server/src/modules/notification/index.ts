/** The notification module's public API: the only file another module may import. */
export { notificationRouter } from './http/routes.js';
export { dispatch, type NotificationInput } from './application/dispatch.js';
