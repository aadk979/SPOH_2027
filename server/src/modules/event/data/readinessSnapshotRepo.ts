import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { readinessCoverageFacts, readinessCoverageRows } from './readinessCoverageSql.js';
import { readinessCardFacts, readinessGiftFacts, readinessStockRows } from './readinessStockSql.js';
import { readinessAttendanceFacts, readinessAttendanceRows } from './readinessAttendanceSql.js';

/**
 * Caller holds Event and current authority. ReadCommitted supplies one fresh
 * snapshot here; separate statements could mix concurrent SHARE-locked writers.
 */
export async function readinessSnapshot(
  tx: PrismaTransactionClient,
  scope: EventScope,
): Promise<unknown> {
  const rows = await tx.$queryRaw<Array<{ snapshot: unknown }>>(Prisma.sql`
    WITH selected_event AS (SELECT id, "organisationId", "permissionsVersion", "permissionsReviewedVersion", "permissionsReviewedAt" FROM "Event" WHERE id = ${scope.eventId}),
      ${readinessCoverageRows}, ${readinessStockRows}, ${readinessAttendanceRows}
    SELECT jsonb_build_object(
      'eventId', e.id,
      'coverage', ${readinessCoverageFacts},
      'categories', jsonb_build_object('activeCategories', (
        SELECT count(*) FROM "CaptureCategory" c WHERE c."eventId" = e.id AND c.active
      )),
      'cardBatch', ${readinessCardFacts},
      'giftStock', ${readinessGiftFacts},
      'attendance', ${readinessAttendanceFacts},
      'rolePermissions', jsonb_build_object(
        'grantsVersion', e."permissionsVersion",
        'reviewedGrantsVersion', e."permissionsReviewedVersion",
        'reviewedAtMs', floor(extract(epoch FROM e."permissionsReviewedAt") * 1000)
      ),
      'notifications', coalesce((
        SELECT jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value))
        FROM "Setting" s WHERE
          (s.scope = 'PLATFORM' AND s."scopeId" = e."organisationId" AND s."eventId" IS NULL AND s.key IN (
            'alertPollSeconds', 'push.ttlSeconds.lostPerson', 'push.ttlSeconds.incident', 'push.ttlSeconds.announcement'
          )) OR
          (s.scope = 'EVENT' AND s."scopeId" = e.id AND s."eventId" = e.id AND s.key = 'incident.pushSeverities')
      ), '[]'::jsonb)
    ) AS snapshot FROM selected_event e
  `);
  return rows[0]?.snapshot ?? null;
}
