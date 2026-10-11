import type { RecentCorrectionRecordsQuery, RecentFootfallResponse } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { toPage } from '../../../platform/db/pagination.js';
import { toFootfallTickRecord } from '../data/mappers.js';
import { findRecentFootfall } from '../data/recentRepo.js';

export async function listRecentFootfall(
  scope: EventScope,
  query: RecentCorrectionRecordsQuery,
): Promise<RecentFootfallResponse> {
  const { data, nextCursor } = toPage(await findRecentFootfall(scope, query), query.limit);
  return { data: data.map(toFootfallTickRecord), meta: { count: data.length, nextCursor } };
}
