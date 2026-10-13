import { ROLE_RANKS } from '@spoh/access-policies';
import type { RosterImportRow } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { ForbiddenError } from '../../../platform/errors/index.js';
import type { AccountProfile } from '../../../platform/identity/accountProfile.js';
import { sameOrganisationIdentity, rosterActorRole, rosterTargetMembership } from '../data/identityStandingRepo.js';
import type { Volunteer } from '../data/repo.js';
import { assertMayManage } from '../domain/escalation.js';
import type { RosterActor } from './context.js';
import { currentRoster } from './currentRoster.js';
type TargetMember = Awaited<ReturnType<typeof rosterTargetMembership>>;

/** Membership-only reuse across this organisation never edits the global profile. */
export async function currentRosterTarget(tx: PrismaTransactionClient, input: {
  actor: RosterActor; row: RosterImportRow; current: Volunteer | null; organisationId: string;
}): Promise<AccountProfile> {
  const { actor, row, current, organisationId } = input;
  const member = current ? await rosterTargetMembership(tx, { scope: actor.scope, personId: current.id }) : null;
  await assertReusableIdentity(tx, { current, member, organisationId });
  const currentActor = await rosterActorRole(tx, { scope: actor.scope, personId: actor.volunteerId });
  assertMayManage({ ...actor, role: currentActor.role }, { role: row.role, existing: current });
  if (!member) await currentRoster(tx, actor, { action: 'People.Invite', role: row.role });
  const profile = intendedProfile({ current, member, row });
  await checkTargetChanges(tx, { actor, row, current, member, profile });
  return profile;
}

async function assertReusableIdentity(tx: PrismaTransactionClient, input: {
  current: Volunteer | null; member: TargetMember; organisationId: string;
}) {
  const { current, member, organisationId } = input;
  if (current && (current.deactivatedAt || current.piiErasedAt ||
    !await sameOrganisationIdentity(tx, { personId: current.id, organisationId }))) throw unavailable();
  if (member && !['ACTIVE', 'INVITED'].includes(member.status)) throw unavailable();
}
function intendedProfile(input: { current: Volunteer | null; member: TargetMember; row: RosterImportRow }): AccountProfile {
  const { current, member, row } = input;
  if (current && !member) return { email: current.email, displayName: current.displayName, phone: current.phone };
  return { email: row.email, displayName: row.displayName, phone: row.phone ?? current?.phone ?? null };
}
async function checkTargetChanges(tx: PrismaTransactionClient, input: {
  actor: RosterActor; row: RosterImportRow; current: Volunteer | null; member: TargetMember; profile: AccountProfile;
}) {
  const { actor, row, current, member, profile } = input;
  if (!member) return;
  if (member.role !== row.role) await targetPermission(tx, { actor, memberId: member.id, action: 'People.AssignRole', role: row.role });
  if (current && (profile.displayName !== current.displayName || profile.phone !== current.phone))
    await targetPermission(tx, { actor, memberId: member.id, action: 'People.Update' });
}

function targetPermission(tx: PrismaTransactionClient, input: {
  actor: RosterActor; memberId: string; action: 'People.AssignRole' | 'People.Update'; role?: RosterImportRow['role'];
}) {
  return requireCurrentPermission(tx, { scope: input.actor.scope, personId: input.actor.volunteerId,
    membershipId: input.actor.audit.membershipId ?? '', action: input.action,
    resource: { type: 'Membership', id: input.memberId },
    ...(input.role ? { facts: { grantedRank: ROLE_RANKS[input.role] } } : {}) });
}
const unavailable = () => new ForbiddenError('This identity cannot be reused here. Ask its organisation administrator to review it.');
