export const LOCAL_READY_CHECKS = [
  'shift-coverage',
  'categories',
  'card-batch',
  'gift-stock',
  'content',
  'attendance',
  'role-permissions',
  'notifications',
] as const;
export const MISSING_READY_CHECKS = ['staging-smoke', 'backups', 'alarms'] as const;
export const MISSING_READY_BLOCKERS = MISSING_READY_CHECKS.map((code) => `go-live:${code}:missing`);
