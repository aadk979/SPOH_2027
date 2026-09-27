import type { LostPersonAlertRecord } from '@spoh/shared';
import type { AlertWithContext } from './repo.js';

export function toAlertRecord(
  alert: AlertWithContext,
  context: { stationName: string | null; ackedByMe: boolean },
): LostPersonAlertRecord {
  return {
    id: alert.id,
    status: alert.status,
    approxAge: alert.approxAge,
    descriptionText: alert.descriptionText,
    clothingText: alert.clothingText,
    lastSeenStationId: alert.lastSeenStationId,
    lastSeenStationName: context.stationName,
    lastSeenAt: alert.lastSeenAt?.toISOString() ?? null,
    raisedById: alert.raisedById,
    raisedByName: alert.raisedBy.displayName,
    // The reporter's number travels with the alert on purpose: the standing
    // instruction is that calling beats tapping, and a searcher who finds the
    // child needs to reach the person who raised it without leaving the screen.
    raisedByPhone: alert.raisedBy.phone,
    raisedAt: alert.raisedAt.toISOString(),
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    ackCount: alert._count.acknowledgements,
    ackedByMe: context.ackedByMe,
  };
}
