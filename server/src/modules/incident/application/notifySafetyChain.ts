import type { IncidentSeverity } from '@spoh/shared';
import { logger } from '../../../platform/logger/index.js';
import { dispatch } from '../../notification/index.js';
import { pushesToSafetyChain, safetyPushMessage } from '../domain/safetyPush.js';

/**
 * Notify the safety chain of a severe incident. The WhatsApp Safety
 * Communications Chat remains the human channel; this feeds it rather than
 * replacing it (PRODUCT_BRIEF §7.4).
 */
export function notifySafetyChain(
  incident: { id: string; severity: IncidentSeverity; type: string; stationName: string | null },
  reporterId: string,
): void {
  if (!pushesToSafetyChain(incident.severity)) {
    logger.info(
      { incidentId: incident.id, severity: incident.severity },
      'incident recorded; below the push threshold',
    );
    return;
  }

  void dispatch({
    kind: 'incident.critical',
    priority: 'URGENT',
    ...safetyPushMessage(incident),
    url: '/safety',
    tag: `incident:${incident.id}`,
    // IC and above: the people who can actually resolve one.
    audience: { everyone: false, minimumRole: 'IC', volunteerIds: [] },
    // The reporter is standing over it already.
    excludeVolunteerId: reporterId,
  });
}
