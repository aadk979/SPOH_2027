/**
 * The settings module's public API: the admin screens' view of the runtime
 * settings in platform/settings. Mounted under /admin by the admin module.
 */
export { getSettingsHandler, updateSettingsHandler } from './http/handlers.js';
