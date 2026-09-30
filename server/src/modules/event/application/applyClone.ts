import { ERROR_CODES } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import { invalidateEventCache } from '../../../platform/event/events.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { findEvent, insertEvent, type Event } from '../data/repo.js';
import {
  copyDaysAndShifts,
  copyGiftTypes,
  copyMemberships,
  copyStations,
  copyTaxonomy,
  readMemberships,
  readStructure,
  type CloneTarget,
} from '../data/cloneRepo.js';
import { movedDays, movedShifts } from '../domain/movedStructure.js';
import type { ClonePlan } from './planClone.js';

/**
 * Create the planned clone in one transaction (ADR-001 §6): a DRAFT event
 * with the source's structure — categories, station types, tags, stations,
 * shift templates, days moved by the offset with their shifts, gift types
 * with stock reset — and, only when asked, the same people INVITED. No
 * operational row comes along. One `event.clone` audit row records it.
 */
export async function applyClone(
  plan: ClonePlan,
  context: { audit: AuditContext; clock?: Clock },
): Promise<Event> {
  if (plan.conflicts.length > 0) {
    throw new ConflictError(ERROR_CODES.CONFLICT, plan.conflicts.join(' '));
  }
  const now = (context.clock ?? systemClock).now();
  const created = await prisma.$transaction(
    async (tx) => {
      const source = await findEvent(plan.source.eventId, tx);
      if (!source) throw new NotFoundError('Event');
      const event = await createClonedEvent(tx, { plan, source });
      await copyStructure(tx, { source: { eventId: source.id }, event, plan, now });
      await writeAudit(tx, {
        ...context.audit,
        eventId: event.id,
        membershipId: null,
        action: 'event.clone',
        entityType: 'Event',
        entityId: event.id,
        after: { clonedFromEventId: source.id, ...plan.request, counts: plan.counts },
      });
      return event;
    },
    { timeout: 30_000 },
  );
  invalidateEventCache();
  return created;
}

function createClonedEvent(
  tx: PrismaTransactionClient,
  { plan, source }: { plan: ClonePlan; source: Event },
): Promise<Event> {
  return insertEvent(tx, {
    organisationId: source.organisationId,
    slug: plan.request.slug,
    name: plan.request.name,
    venue: source.venue,
    timezone: source.timezone,
    locale: source.locale,
    dayBoundaryMinutes: source.dayBoundaryMinutes,
    ...(source.branding !== null ? { branding: source.branding } : {}),
    status: 'DRAFT',
    clonedFromEventId: source.id,
  });
}

async function copyStructure(
  tx: PrismaTransactionClient,
  input: { source: EventScope; event: Event; plan: ClonePlan; now: Date },
): Promise<void> {
  const { source, event, plan, now } = input;
  const target: CloneTarget = { eventId: event.id, ids: new Map() };
  const offsetDays = plan.request.dayOffsetDays;
  const structure = await readStructure(tx, source);
  await copyTaxonomy(tx, target, structure);
  await copyStations(tx, target, structure);
  await copyGiftTypes(tx, target, structure.giftTypes);
  const days = movedDays(structure.days, offsetDays);
  const shifts = movedShifts(structure.shifts, { offsetDays, timezone: event.timezone });
  await copyDaysAndShifts(tx, target, { days, shifts });
  if (plan.request.inviteSamePeople) {
    const memberships = await readMemberships(tx, source);
    await copyMemberships(tx, target, { memberships, invitedAt: now });
  }
}
