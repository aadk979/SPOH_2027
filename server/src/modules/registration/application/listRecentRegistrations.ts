import type { RecentCorrectionRecordsQuery, RecentRegistrationsResponse } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { toPage } from '../../../platform/db/pagination.js';
import { toRegistrationRecord } from '../data/mappers.js';
import { findRecentRegistrations } from '../data/recentRepo.js';

export async function listRecentRegistrations(
  scope: EventScope,
  query: RecentCorrectionRecordsQuery,
): Promise<RecentRegistrationsResponse> {
  const { data, nextCursor } = toPage(await findRecentRegistrations(scope, query), query.limit);
  return { data: data.map(toRegistrationRecord), meta: { count: data.length, nextCursor } };
}
