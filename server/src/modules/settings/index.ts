/**
 * The settings module's public API: the admin screens' view of the runtime
 * settings in platform/settings. Mounted under /admin by the admin module.
 */
export {
  changeEventSettingHandler,
  getEventSettingsHandler,
  getSettingsHandler,
  updateSettingsHandler,
} from './http/handlers.js';
export { settingsScheduledHandlers } from './jobs.js';
