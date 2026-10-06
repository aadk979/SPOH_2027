export const LOCAL_READY_CHECKS = [
  'shift-coverage',
  'categories',
  'card-batch',
  'gift-stock',
  'attendance',
] as const;
export const MISSING_READY_CHECKS = [
  'content',
  'role-permissions',
  'notifications',
  'staging-smoke',
  'backups',
  'alarms',
] as const;
export const MISSING_READY_BLOCKERS = MISSING_READY_CHECKS.map((code) => `go-live:${code}:missing`);
