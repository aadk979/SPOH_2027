import type { RosterImportRequest, RosterImportResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { planRosterImport } from '../domain/planRosterImport.js';
import { applyRosterImport } from './applyRosterImport.js';
import type { RosterActor } from './context.js';
import { loadImportSnapshot } from './loadImportSnapshot.js';
import { mintIdentities } from './mintIdentities.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { currentRoster } from './currentRoster.js';
import { identitiesByEmail, reserveIdentityDeliveries } from '../../../platform/identity/deliveryQuota.js';
import { systemClock } from '../../../platform/time/index.js';
import { ForbiddenError } from '../../../platform/errors/index.js';

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
  if (request.commit) await prisma.$transaction((tx) => currentRoster(tx, actor, { action: 'Roster.Edit' }));
  const snapshot = await loadImportSnapshot(request, actor);
  const plan = planRosterImport(request.rows, snapshot, { mayCreate: actor.mayProvision });
  if (!request.commit) return { committed: false, ...plan.counters, issues: plan.issues };
  if (plan.issues.length)
    throw new ValidationError('Fix every roster preview issue before applying', {
      issues: plan.issues,
    });

  await prisma.$transaction(async (tx) => {
    await currentRoster(tx, actor, { action: 'Roster.Edit' });
    const emails = [...new Set(request.rows.map((row) => row.email))];
    const accounts = await identitiesByEmail(tx, emails);
    if ([...accounts.values()].some((account) => account.deactivatedAt || account.piiErasedAt))
      throw new ForbiddenError('Reactivate globally suspended accounts before importing.');
    for (const step of plan.people) if (step.created)
      await currentRoster(tx, actor, { action: 'People.Invite', role: step.row.role });
    await reserveIdentityDeliveries(tx, { scope: actor.scope,
      count: emails.filter((email) => !accounts.has(email)).length, now: systemClock.now() });
  });
  const identities = await mintIdentities(request.rows, { accounts: snapshot.accounts, actor });
  await prisma.$transaction(async (tx) => {
    await holdCaptureEvent(tx, actor.scope);
    await currentRoster(tx, actor, { action: 'Roster.Edit' });
    for (const step of plan.people) {
      if (step.created)
        await currentRoster(tx, actor, { action: 'People.Invite', role: step.row.role });
    }
    await applyRosterImport(tx, plan, { identities, scope: actor.scope, audit: actor.audit });
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
