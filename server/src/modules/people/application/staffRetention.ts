import type { AuditContext } from '../../../platform/audit/index.js';
import { writeAudit } from '../../../platform/audit/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';
import { archivedPeople, clearArchivedNotes, scheduleStaffRetention, archiveRetentionEvent, lockRetentionPerson } from '../data/retentionRepo.js';
import { clearEventNotices } from '../data/notificationPersonalRepo.js';
import { clearArchivedDescriptors } from '../data/archivedDescriptorRepo.js';
import { anonymiseInTransaction } from './anonymise.js';

const deadline = (at: Date, days: number) => new Date(at.getTime() + days * 86400000);

async function staffDeadline(tx: PrismaTransactionClient, input: { eventId: string; organisationId: string; archivedAt: Date }) {
  const days = Number((await loadResolvedSetting('privacy.staffRetentionDays', input, tx)).value);
  return deadline(input.archivedAt, days);
}

export async function scheduleArchivedRetention(tx: PrismaTransactionClient,
  input: { eventId: string; archivedAt: Date; audit: AuditContext }) {
  const event = await tx.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { organisationId: true } });
  const runAt = await staffDeadline(tx, { eventId: input.eventId, organisationId: event.organisationId, archivedAt: input.archivedAt });
  await scheduleStaffRetention(tx, { eventId: input.eventId, runAt });
}

async function canAnonymise(tx: PrismaTransactionClient, person: Awaited<ReturnType<typeof archivedPeople>>[number], now: Date) {
  if (person.organisationMemberships.length) return false;
  for (const member of person.eventMemberships) {
    if (member.status !== 'ENDED' || member.event.status !== 'ARCHIVED' || !member.event.archivedAt) return false;
    const expires = await staffDeadline(tx, { eventId: member.eventId,
      organisationId: member.event.organisationId, archivedAt: member.event.archivedAt });
    if (expires > now) return false;
  }
  return true;
}

/** Historical ids and counts survive; another current event keeps its person's contact data. */
export async function purgeStaffInTransaction(tx: PrismaTransactionClient, scope: EventScope,
  input: { now: Date; audit: AuditContext }): Promise<number> {
  const event = await archiveRetentionEvent(tx, scope);
  if (event.status !== 'ARCHIVED' || !event.archivedAt) return 0;
  if (await staffDeadline(tx, { ...scope, organisationId: event.organisationId, archivedAt: event.archivedAt }) > input.now) return 0;
  const notes = await clearArchivedNotes(tx, scope);
  const notices = await clearEventNotices(tx, scope);
  const descriptors = await clearArchivedDescriptors(tx, scope);
  const { people, sessionsRevoked, identityJournalsRemoved } = await eraseEligibleStaff(tx, scope, input.now);
  const changed = [notes.count, people, notices.count, descriptors, sessionsRevoked, identityJournalsRemoved].some((count) => count > 0);
  if (changed) await writeAudit(tx, { ...input.audit, eventId: scope.eventId,
    action: 'staff.purge', entityType: 'EventMembership', entityId: null,
    after: { notes: notes.count, people, notices: notices.count, descriptors, sessionsRevoked, identityJournalsRemoved, reason: 'retention' } });
  return notes.count + people + notices.count + descriptors + sessionsRevoked + identityJournalsRemoved;
}

async function eraseEligibleStaff(tx: PrismaTransactionClient, scope: EventScope, now: Date) {
  let people = 0;
  let sessionsRevoked = 0;
  let identityJournalsRemoved = 0;
  for (const candidate of await archivedPeople(tx, scope)) {
    const person = await lockRetentionPerson(tx, scope, candidate.id);
    if (person && await canAnonymise(tx, person, now)) {
      const erased = await anonymiseInTransaction(tx,
        { personId: person.id, now, reason: 'staff-retention' });
      people += erased.people;
      sessionsRevoked += erased.sessionsRevoked;
      identityJournalsRemoved += erased.identityJournalsRemoved;
    }
  }
  return { people, sessionsRevoked, identityJournalsRemoved };
}
