import { MembershipStatus } from '@spoh/shared';
import { z } from 'zod';
import { fromFailures, itemEvaluator, ReadinessId } from './contract.js';

const Shift = z.object({ id: ReadinessId, dayId: ReadinessId, templateId: ReadinessId }).strict();
const Assignment = z
  .object({
    shiftId: ReadinessId,
    stationId: ReadinessId,
    membershipId: ReadinessId.nullable(),
    personId: ReadinessId,
    dayId: ReadinessId,
  })
  .strict();
const Membership = z
  .object({ id: ReadinessId, personId: ReadinessId, status: MembershipStatus })
  .strict();

/** Readers select active templates and stations whose station type is also active. */
export const ShiftCoverageFacts = z
  .object({
    dayIds: z.array(ReadinessId),
    templateIds: z.array(ReadinessId),
    stationIds: z.array(ReadinessId),
    shifts: z.array(Shift),
    memberships: z.array(Membership),
    assignments: z.array(Assignment),
  })
  .strict()
  .refine((facts) => coverageIdsValid(facts), 'Coverage snapshot identities must be unambiguous.');
type ShiftCoverageFacts = z.infer<typeof ShiftCoverageFacts>;

function uniqueIds(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

function coverageIdsValid(facts: {
  dayIds: string[];
  templateIds: string[];
  stationIds: string[];
  shifts: z.infer<typeof Shift>[];
  memberships: z.infer<typeof Membership>[];
}): boolean {
  const lists = [
    facts.dayIds,
    facts.templateIds,
    facts.stationIds,
    facts.shifts.map((shift) => shift.id),
    facts.memberships.map((member) => member.id),
  ];
  const pairs = facts.shifts.map((shift) => `${shift.dayId}\0${shift.templateId}`);
  return (
    lists.every(uniqueIds) &&
    uniqueIds(pairs) &&
    facts.shifts.every(
      (shift) => facts.dayIds.includes(shift.dayId) && facts.templateIds.includes(shift.templateId),
    )
  );
}

function hasMaterialisedGrid(facts: ShiftCoverageFacts): boolean {
  const shifts = new Set(facts.shifts.map((shift) => `${shift.dayId}\0${shift.templateId}`));
  return facts.dayIds.every((day) =>
    facts.templateIds.every((template) => shifts.has(`${day}\0${template}`)),
  );
}

function coveredPairs(facts: ShiftCoverageFacts): Set<string> {
  const eligible = new Map(
    facts.memberships
      .filter((member) => member.status === 'ACTIVE')
      .map((member) => [member.id, member.personId]),
  );
  const shifts = new Map(facts.shifts.map((shift) => [shift.id, shift]));
  const covered = new Set<string>();
  for (const assignment of facts.assignments) {
    const shift = shifts.get(assignment.shiftId);
    if (!assignment.membershipId || eligible.get(assignment.membershipId) !== assignment.personId) {
      continue;
    }
    if (!shift || shift.dayId !== assignment.dayId) continue;
    covered.add(`${assignment.shiftId}\0${assignment.stationId}`);
  }
  return covered;
}

function coverageFailures(facts: ShiftCoverageFacts): string[] {
  if (!facts.dayIds.length || !facts.templateIds.length || !facts.stationIds.length) {
    return ['coverage-structure-empty'];
  }
  if (!hasMaterialisedGrid(facts)) return ['shifts-not-materialised'];
  const covered = coveredPairs(facts);
  const required = facts.shifts.filter(
    (shift) => facts.dayIds.includes(shift.dayId) && facts.templateIds.includes(shift.templateId),
  );
  return required.every((shift) =>
    facts.stationIds.every((station) => covered.has(`${shift.id}\0${station}`)),
  )
    ? []
    : ['shift-station-unstaffed'];
}

export const evaluateShiftCoverage = itemEvaluator('shift-coverage', ShiftCoverageFacts, (facts) =>
  fromFailures(coverageFailures(facts)),
);
