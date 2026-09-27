import type { CommitteeRole } from '@spoh/shared';
import { ForbiddenError } from '../../../platform/errors/index.js';

/**
 * A station's roster carries its volunteers' phone numbers. An IC reads the
 * roster of the stations they are rostered at, and only those (F04-004,
 * ADR-005 C3); a Deputy and above read every station's.
 */
export function assertMayReadRoster(viewer: { role: CommitteeRole }, rosteredThere: boolean): void {
  if (viewer.role === 'IC' && !rosteredThere) {
    throw new ForbiddenError('You can read the roster of your own stations only');
  }
}
