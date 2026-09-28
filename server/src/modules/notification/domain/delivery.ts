import { ROLE_PRECEDENCE, type CommitteeRole, type NotificationKind } from '@spoh/shared';

/**
 * How long a push service may hold a message for a device that is offline.
 *
 * Short by design. A lost-person alert delivered forty minutes late is worse
 * than one not delivered at all: the search has moved on, the child has been
 * found, and the volunteer acts on something that is no longer true.
 */
export const TTL_SECONDS: Readonly<Record<NotificationKind, number>> = Object.freeze({
  'lostPerson.raised': 600,
  'lostPerson.resolved': 600,
  'incident.critical': 900,
  'announcement.urgent': 1800,
  'gift.lowStock': 1800,
});

/** Every role at least as senior as `minimumRole`. */
export function rolesAtOrAbove(minimumRole: CommitteeRole): CommitteeRole[] {
  const ceiling = ROLE_PRECEDENCE[minimumRole];
  return (Object.keys(ROLE_PRECEDENCE) as CommitteeRole[]).filter(
    (role) => ROLE_PRECEDENCE[role] <= ceiling,
  );
}

/**
 * 404 and 410 are the documented way a push service says the subscription is
 * permanently gone. Anything else may be transient.
 */
export function subscriptionGone(status: number | undefined): boolean {
  return status === 404 || status === 410;
}
