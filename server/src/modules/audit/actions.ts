import type { AuditAction } from '../../lib/audit.js';

/**
 * The action and entity vocabularies, as data.
 *
 * `AuditAction` is a type and disappears at build time, but the filter dropdown
 * needs the same list at runtime. Declaring it here with a compile-time check
 * against the union means adding an action to `lib/audit.ts` and forgetting it
 * here is a type error rather than a filter that quietly cannot find anything.
 */
export const AUDIT_ACTIONS = [
  'attendance.present',
  'attendance.challenge',
  'registration.create',
  'registration.createGroup',
  'registration.void',
  'footfall.tick',
  'footfall.bulk',
  'footfall.void',
  'card.issue',
  'card.stamp',
  'card.void',
  'card.reissue',
  'gift.redeem',
  'gift.adjust',
  'incident.create',
  'incident.statusChange',
  'incident.followUp',
  'lostPerson.raise',
  'lostPerson.resolve',
  'lostPerson.purge',
  'lostFound.create',
  'lostFound.claim',
  'roster.edit',
  'roster.import',
  'shift.checkIn',
  'shift.checkOut',
  'swap.decide',
  'announcement.send',
  'fallback.declare',
  'fallback.close',
  'import.run',
  'user.provision',
  'user.update',
  'user.deactivate',
  'user.reactivate',
  'user.resendInvite',
  'assignment.create',
  'assignment.delete',
  'station.create',
  'station.update',
  'eventDay.create',
  'eventDay.update',
  'giftType.create',
  'giftType.update',
  'settings.update',
  'session.create',
  'session.revoke',
  'session.reuseDetected',
  'notification.dispatch',
  'media.upload',
  'auth.stationScopeBypass',
  'auth.denied',
  'auth.noRosterRow',
  'rbac.denied',
  'rbac.stationScopeDenied',
  'rateLimit.exceeded',
  'auth.untrustedOrigin',
  'system.error',
] as const satisfies readonly AuditAction[];

/**
 * Exhaustiveness in the other direction.
 *
 * `satisfies` above proves every listed string is a real action; this proves
 * every real action is listed. Without it, a new action would simply be absent
 * from the dropdown with nothing to complain about it.
 */
type Listed = (typeof AUDIT_ACTIONS)[number];
type Missing = Exclude<AuditAction, Listed>;
const _exhaustive: Missing extends never ? true : ['unlisted audit actions:', Missing] = true;
void _exhaustive;

/** The entity types the log actually writes. Used for the filter dropdown. */
export const AUDIT_ENTITY_TYPES = [
  'Announcement',
  'AppSetting',
  'Attendance',
  'EventDay',
  'FallbackWindow',
  'FootfallTick',
  'GiftRedemption',
  'GiftType',
  'ImportBatch',
  'Incident',
  'LostFoundItem',
  'LostPersonAlert',
  'MediaObject',
  'MissionCard',
  'PushSubscription',
  'Registration',
  'Request',
  'RefreshSession',
  'ShiftAssignment',
  'ShiftSwapRequest',
  'Station',
  'Volunteer',
] as const;
