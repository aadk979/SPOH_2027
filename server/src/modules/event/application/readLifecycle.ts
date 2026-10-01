import type { EventLifecycleResponse } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { lifecycleState } from '../data/lifecycleRepo.js';
import { toLifecycleResponse } from '../data/lifecycleMapper.js';

export async function readLifecycle(scope: EventScope): Promise<EventLifecycleResponse> {
  const row = await lifecycleState(scope);
  return toLifecycleResponse(row);
}
