import type { EventStatus } from '@spoh/shared';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';

export const PHASE_LABELS: Record<EventStatus, string> = {
  DRAFT: 'Draft',
  READY: 'Ready',
  REHEARSAL: 'Rehearsal',
  LIVE: 'Live',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};
export const TRANSITION_LABELS: Record<EventStatus, string> = {
  DRAFT: 'Return to draft',
  READY: 'Mark ready',
  REHEARSAL: 'Start rehearsal',
  LIVE: 'Go live',
  CLOSED: 'Close event',
  ARCHIVED: 'Archive event',
};
export function transitionLabel(from: EventStatus, to: EventStatus): string {
  if (from === 'REHEARSAL' && to === 'READY') return 'End rehearsal';
  if (from === 'CLOSED' && to === 'LIVE') return 'Reopen event';
  return TRANSITION_LABELS[to];
}
const BLOCKER_COPY: Readonly<Record<string, string>> = {
  timezone: 'Choose a valid event timezone.',
  'event-days': 'Add at least one event day.',
  'shift-templates': 'Add an active shift template.',
  'station-types': 'Add an active station type.',
  categories: 'Add active visitor categories for registration stations.',
  'already-live': 'An event that has been live cannot return to draft.',
  'go-live-checklist-unavailable': 'The go-live checklist is not available yet.',
  'reopen-window-expired': 'The 48-hour reopening window is unavailable or has ended.',
  'platform-admin-required': 'A current platform administrator is required.',
  'reason-required': 'Enter a reason for reopening.',
  'lost-person-purge': 'Resolved lost-person descriptions must be purged.',
  'final-report': 'A verified final report is required.',
  'capture-grace-period': 'The late-sync grace period must finish first.',
  'archive-unavailable': 'Archiving is not available yet.',
};
export function lifecycleBlocker(code: string): string {
  return BLOCKER_COPY[code] ?? 'A readiness requirement is not satisfied.';
}
export function lifecycleError(error: unknown): string {
  if (error instanceof NetworkError)
    return 'Could not confirm the change. Retry the same request or reload readiness.';
  if (!(error instanceof ApiError))
    return 'Could not confirm the change. Try again or reload readiness.';
  if (error.status === 409)
    return 'Readiness or the event state changed. Reload readiness and review the transition again.';
  if ([401, 403, 404].includes(error.status))
    return 'Lifecycle access is unavailable. Reload your session before trying again.';
  return 'Could not confirm the change. Retry the same request or reload readiness.';
}
export function lifecycleAccessDenied(error: unknown): boolean {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}
