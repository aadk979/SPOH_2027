/**
 * Every `error.code` the API can return. The client switches on these, so they
 * are part of the contract and must not be renamed without a client change.
 */
export const ERROR_CODES = {
  // auth / authz
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  NOT_PROVISIONED: 'NOT_PROVISIONED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  FORBIDDEN: 'FORBIDDEN',
  STATION_SCOPE_DENIED: 'STATION_SCOPE_DENIED',
  /// The refresh cookie is absent, expired, or already rotated.
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  /// A rotated refresh token was presented again: the cookie leaked.
  SESSION_REUSE_DETECTED: 'SESSION_REUSE_DETECTED',
  /// An admin tried to grant a role at or above their own, or edit their own.
  ROLE_ESCALATION_DENIED: 'ROLE_ESCALATION_DENIED',
  SELF_MUTATION_DENIED: 'SELF_MUTATION_DENIED',

  // request shape
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',

  // idempotency
  IDEMPOTENCY_KEY_REUSE: 'IDEMPOTENCY_KEY_REUSE',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',

  // domain
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ALREADY_VOIDED: 'ALREADY_VOIDED',
  NOT_ON_SHIFT: 'NOT_ON_SHIFT',
  ALREADY_CHECKED_IN: 'ALREADY_CHECKED_IN',
  NOT_CHECKED_IN: 'NOT_CHECKED_IN',
  ALREADY_CHECKED_OUT: 'ALREADY_CHECKED_OUT',
  /// Check-in comes after verified attendance for the day.
  ATTENDANCE_REQUIRED: 'ATTENDANCE_REQUIRED',
  /// Today is not one of the event's configured days.
  NO_EVENT_TODAY: 'NO_EVENT_TODAY',
  /// The QR or PIN is wrong, expired, rotated, from another day, or its verifier can no longer verify.
  ATTENDANCE_CODE_INVALID: 'ATTENDANCE_CODE_INVALID',
  /// A valid code this person may not use: their own, or an exco's code for another exco.
  VERIFICATION_NOT_ALLOWED: 'VERIFICATION_NOT_ALLOWED',
  /// QR attendance needs both phones on the campus network; the PIN does not.
  QR_OFF_CAMPUS: 'QR_OFF_CAMPUS',
  STATION_INACTIVE: 'STATION_INACTIVE',
  STATION_DOES_NOT_COUNT_ENTRY: 'STATION_DOES_NOT_COUNT_ENTRY',
  CARD_NOT_FOUND: 'CARD_NOT_FOUND',
  CARD_ALREADY_STAMPED: 'CARD_ALREADY_STAMPED',
  CARD_VOIDED: 'CARD_VOIDED',
  CARD_ALREADY_ISSUED: 'CARD_ALREADY_ISSUED',
  CARD_NOT_ISSUED: 'CARD_NOT_ISSUED',
  STATION_DOES_NOT_STAMP: 'STATION_DOES_NOT_STAMP',
  GIFT_OUT_OF_STOCK: 'GIFT_OUT_OF_STOCK',
  GIFT_ALREADY_REDEEMED: 'GIFT_ALREADY_REDEEMED',
  SWAP_NOT_PENDING: 'SWAP_NOT_PENDING',
  SLOT_ALREADY_COMPLETED: 'SLOT_ALREADY_COMPLETED',
  ALERT_ALREADY_RESOLVED: 'ALERT_ALREADY_RESOLVED',
  /// A state machine refused the move (ADR-002 §2): the record's status does not allow it.
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  FALLBACK_ALREADY_OPEN: 'FALLBACK_ALREADY_OPEN',
  FALLBACK_ALREADY_CLOSED: 'FALLBACK_ALREADY_CLOSED',
  ITEM_ALREADY_CLAIMED: 'ITEM_ALREADY_CLAIMED',
  IMPORT_FAILED: 'IMPORT_FAILED',
  STATION_CODE_TAKEN: 'STATION_CODE_TAKEN',
  EVENT_DAY_EXISTS: 'EVENT_DAY_EXISTS',
  GIFT_TYPE_EXISTS: 'GIFT_TYPE_EXISTS',
  STATION_IN_USE: 'STATION_IN_USE',
  REPORTING_CYCLE: 'REPORTING_CYCLE',
  /// A capture write arrived for a station whose shift blocks no longer cover now.
  INVALID_SETTING: 'INVALID_SETTING',

  // infrastructure
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  /// S3 is not configured, so there is nowhere to put a photo.
  MEDIA_NOT_CONFIGURED: 'MEDIA_NOT_CONFIGURED',
  /// Web Push has no VAPID keys; the polls still deliver.
  PUSH_NOT_CONFIGURED: 'PUSH_NOT_CONFIGURED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
