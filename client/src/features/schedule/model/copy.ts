import type { ScheduleError, ScheduleKind, ScheduledActionStatus } from '@spoh/shared';

export const scheduleKindLabels: Record<ScheduleKind, string> = {
  LIFECYCLE: 'Event lifecycle',
  ANNOUNCEMENT: 'Announcement publication',
  SETTING: 'Event setting',
  CAPTURE_CATEGORY: 'Capture category',
  REPORT: 'Report snapshot',
  LOST_PERSON_PURGE: 'Lost-person record cleanup',
  VISITOR_PURGE: 'Visitor record cleanup',
  SESSION_PRUNE: 'Session cleanup',
  REPLAY_PRUNE: 'Request replay cleanup',
  OTHER: 'Other scheduled work',
};
export const scheduleStatusLabels: Record<ScheduledActionStatus, string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  DEAD: 'Stopped after failed attempts',
};
export const scheduleErrorLabels: Record<ScheduleError, string> = {
  INVALID_PAYLOAD: 'The saved request was invalid.',
  AUTHORITY_CHANGED: 'The organiser no longer had permission to run this work.',
  GUARD_FAILED: 'The event or target no longer met the requirements.',
  TOO_LATE: 'The permitted time window had ended.',
  TARGET_MISSING: 'The target was no longer available.',
  SYSTEM_ONLY: 'This work requires an automatic system action.',
  HANDLER_UNAVAILABLE: 'This type of work was unavailable.',
  EXECUTION_FAILED: 'The attempt could not finish.',
  ATTEMPTS_EXHAUSTED: 'The retry limit was reached.',
};
