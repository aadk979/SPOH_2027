import type { CloneEventRequest } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { readMemberships, readStructure, type Structure } from '../data/cloneRepo.js';
import { shiftDate } from '../domain/cloneShift.js';
import type { ClonePlan } from './planClone.js';

export async function managedClonePlan(
  tx: PrismaTransactionClient,
  input: { source: { id: string; name: string }; request: CloneEventRequest },
): Promise<ClonePlan> {
  const { source, request } = input;
  const structure = await readStructure(tx, { eventId: source.id });
  const members = request.inviteSamePeople ? await readMemberships(tx, { eventId: source.id }) : [];
  return {
    source: { eventId: source.id, name: source.name },
    request,
    conflicts: [],
    days:
      request.copy?.daysAndShifts === false
        ? []
        : structure.days.map((day) => ({
            from: day.date.toISOString().slice(0, 10),
            to: shiftDate(day.date.toISOString().slice(0, 10), request.dayOffsetDays),
            label: day.label,
          })),
    counts: selectedCounts(structure, { request, memberships: members.length }),
  };
}

function selectedCounts(
  structure: Structure,
  input: { request: CloneEventRequest; memberships: number },
): ClonePlan['counts'] {
  const selected = input.request.copy;
  const count = (part: keyof NonNullable<CloneEventRequest['copy']>, length: number) =>
    selected?.[part] === false ? 0 : length;
  return {
    categories: count('categories', structure.categories.length),
    stationTypes: count('stations', structure.stationTypes.length),
    stationTags: count('stations', structure.tags.length),
    stations: count('stations', structure.stations.length),
    shiftTemplates: count('daysAndShifts', structure.templates.length),
    days: count('daysAndShifts', structure.days.length),
    shifts: count('daysAndShifts', structure.shifts.length),
    giftTypes: count('gifts', structure.giftTypes.length),
    memberships: input.memberships,
  };
}
