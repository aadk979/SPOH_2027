import type { CloneEventRequest } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findEvent } from '../data/repo.js';
import { readMemberships, readStructure, slugTaken } from '../data/cloneRepo.js';
import { shiftDate } from '../domain/cloneShift.js';

type Counted =
  | 'categories'
  | 'stationTypes'
  | 'stationTags'
  | 'stations'
  | 'shiftTemplates'
  | 'days'
  | 'shifts'
  | 'giftTypes'
  | 'memberships';

/**
 * What cloning an event would create (ADR-001 §6, plan then apply): per-table
 * counts, each day's new date, and anything that stops it. The set-up wizard
 * (P13.2) shows it before `applyClone`.
 */
export interface ClonePlan {
  source: EventScope & { name: string };
  request: CloneEventRequest;
  counts: Record<Counted, number>;
  days: Array<{ from: string; to: string; label: string }>;
  conflicts: string[];
}

/** Reads only: nothing is created until the plan is applied. */
export async function planClone(
  source: EventScope,
  request: CloneEventRequest,
): Promise<ClonePlan> {
  const event = await findEvent(source.eventId);
  if (!event) throw new NotFoundError('Event');
  const structure = await readStructure(prisma, source);
  const memberships = request.inviteSamePeople ? await readMemberships(prisma, source) : [];
  const taken = await slugTaken(event.organisationId, request.slug);

  return {
    source: { eventId: event.id, name: event.name },
    request,
    counts: {
      categories: structure.categories.length,
      stationTypes: structure.stationTypes.length,
      stationTags: structure.tags.length,
      stations: structure.stations.length,
      shiftTemplates: structure.templates.length,
      days: structure.days.length,
      shifts: structure.shifts.length,
      giftTypes: structure.giftTypes.length,
      memberships: memberships.length,
    },
    days: structure.days.map((day) => {
      const from = day.date.toISOString().slice(0, 10);
      return { from, to: shiftDate(from, request.dayOffsetDays), label: day.label };
    }),
    conflicts: taken ? [`The address "${request.slug}" is already used by another event.`] : [],
  };
}
