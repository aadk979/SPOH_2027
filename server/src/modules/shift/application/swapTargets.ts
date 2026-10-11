import type { EventScope } from '../../../platform/db/eventScope.js';
import { listSwapTargetRows } from '../data/swapTargetsRepo.js';

export const listSwapTargets = (scope: EventScope, viewerId: string) =>
  listSwapTargetRows(scope, viewerId);
