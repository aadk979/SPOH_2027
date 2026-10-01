/** The attendance module's public API: verified presence on an event day. */
export { attendanceRouter } from './http/routes.js';
export {
  getAttendanceConfigHandler,
  changeAttendanceConfigHandler,
  testAttendanceNetworkHandler,
} from './http/adminHandlers.js';
