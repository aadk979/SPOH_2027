import type { CommitteeRole } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { Clock } from '../../../platform/time/index.js';

export interface DirectSender {
  volunteerId: string; role: CommitteeRole; scope: EventScope; membershipId?: string; clock?: Clock;
}
