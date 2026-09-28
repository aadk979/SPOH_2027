import { roleMeets, type CommitteeRole } from '@spoh/shared';
import { ForbiddenError } from '../../../platform/errors/index.js';

/**
 * An IC may address their own station; only a DC and above may address the
 * whole event. Checked in the use case rather than by two separate routes
 * because the distinction is in the payload, not the path — and the
 * capability check on the route cannot see the payload.
 */
export function assertMaySend(sender: { role: CommitteeRole }, stationId: string | null): void {
  if (!stationId && !roleMeets(sender.role, 'DEPUTY_COORDINATOR')) {
    throw new ForbiddenError(
      'Only a Deputy Coordinator or above may send an event-wide announcement. Target a station instead.',
    );
  }
}

/** Lock screens cut mid-word, so the push preview is truncated here. */
export function pushPreview(body: string): string {
  return body.length > 140 ? `${body.slice(0, 137)}...` : body;
}
