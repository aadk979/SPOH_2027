import type { RosterImportRequest, RosterImportResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { planRosterImport } from '../domain/planRosterImport.js';
import { applyRosterImport } from './applyRosterImport.js';
import type { RosterActor } from './context.js';
import { loadImportSnapshot } from './loadImportSnapshot.js';
import { mintIdentities } from './mintIdentities.js';

/**
 * Roster CSV import. A preview unless `commit` is set: importing 200
 * volunteers is exactly the operation you want to see the diff of first. The
 * preview is the plan; a commit mints identities, then applies the plan in one
 * transaction, because a half-imported roster on the morning of 6 January
 * would be worse than none.
 */
export async function importRoster(
  request: RosterImportRequest,
  actor: RosterActor,
): Promise<RosterImportResponse> {
  const snapshot = await loadImportSnapshot(request, actor);
  const plan = planRosterImport(request.rows, snapshot, { mayCreate: actor.mayProvision });
  if (!request.commit) return { committed: false, ...plan.counters, issues: plan.issues };

  const identities = await mintIdentities(request.rows, snapshot.accounts);
  await prisma.$transaction(async (tx) => {
    await applyRosterImport(tx, plan, { identities, audit: actor.audit });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'roster.import',
      entityType: 'Volunteer',
      entityId: null,
      after: { rowCount: request.rows.length, ...plan.counters },
    });
  });
  invalidateVolunteerCache();
  return { committed: true, ...plan.counters, issues: plan.issues };
}
