import type { RosterImportRequest, RosterImportResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { planRosterImport } from '../domain/planRosterImport.js';
import { applyRosterImport } from './applyRosterImport.js';
import type { RosterActor } from './context.js';
import { loadImportSnapshot } from './loadImportSnapshot.js';
import { mintIdentities } from './mintIdentities.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { currentRoster } from './currentRoster.js';
import { currentRosterTarget } from './currentRosterTarget.js';
import { holdRosterPeople, rosterOrganisation } from '../data/identityStandingRepo.js';
import { findVolunteerByEmail } from '../data/repo.js';
import { systemClock } from '../../../platform/time/index.js';
import { recordRosterImport } from '../data/importMetadataRepo.js';
import { inviteRosterIdentity } from './inviteRosterIdentity.js';
import { holdReportingEvent } from '../../../platform/db/reportingLine.js';

/** Preview is read-only. Commit binds the complete roster atomically, then delivers separately journalled invitations. */
export async function importRoster(request: RosterImportRequest,
  actor: RosterActor): Promise<RosterImportResponse> {
  // Commit must prove current writable standing before interpreting a possibly stale preview.
  if (request.commit) await prisma.$transaction((tx) => currentRoster(tx, actor, { action: 'Roster.Edit' }));
  const snapshot = await loadImportSnapshot(request, actor);
  const plan = planRosterImport(request.rows, snapshot, { mayCreate: actor.mayProvision });
  if (!request.commit) return { committed: false, ...plan.counters, issues: plan.issues };
  if (plan.issues.length) throw new ValidationError('Fix every roster preview issue before applying', { issues: plan.issues });
  await prisma.$transaction((tx) => validateRosterIntent(tx, { request, actor }));
  const identities = await mintIdentities(request.rows, { actor });
  await prisma.$transaction(async (tx) => {
    await validateRosterIntent(tx, { request, actor });
    await applyRosterImport(tx, plan, { identities, scope: actor.scope, actor, ...(actor.clock ? { clock: actor.clock } : {}) });
    await recordRosterImport(tx, actor.scope, { rowCount: plan.people.length, importedById: actor.volunteerId,
      now: (actor.clock ?? systemClock).now() });
    await writeAudit(tx, { ...actor.audit, action: 'roster.import', entityType: 'Volunteer',
      entityId: null, after: { rowCount: request.rows.length, ...plan.counters } });
  });
  invalidateVolunteerCache();
  for (const [email, identity] of identities) {
    const row = request.rows.find((candidate) => candidate.email === email)!;
    await inviteRosterIdentity({ row, actor, identity });
  }
  return { committed: true, ...plan.counters, issues: plan.issues };
}

async function validateRosterIntent(tx: PrismaTransactionClient, input: { request: RosterImportRequest; actor: RosterActor }) {
  const { request, actor } = input;
  await holdReportingEvent(tx, actor.scope);
  await holdCaptureEvent(tx, actor.scope);
  await holdRosterPeople(tx, { scope: actor.scope, actorId: actor.volunteerId,
    emails: request.rows.flatMap((row) => [row.email, ...(row.reportsToEmail ? [row.reportsToEmail] : [])]) });
  await currentRoster(tx, actor, { action: 'Roster.Edit' });
  const organisationId = await rosterOrganisation(tx, actor.scope);
  const seen = new Set<string>();
  for (const row of request.rows) {
    if (seen.has(row.email)) continue;
    seen.add(row.email);
    const current = await findVolunteerByEmail(actor.scope, row.email, tx);
    await currentRosterTarget(tx, { actor, row, current, organisationId });
  }
}
