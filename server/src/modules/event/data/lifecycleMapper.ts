import type { EventLifecycleResponse } from '@spoh/shared';
import type { LifecycleStateRow } from './lifecycleRepo.js';

export function toLifecycleResponse(row: LifecycleStateRow): EventLifecycleResponse {
  return {
    lifecycle: {
      eventId: row.id,
      status: row.status,
      version: row.lifecycleVersion,
      hasBeenLive: row.hasBeenLive,
    },
  };
}
