import type { MyAssignment } from '@spoh/shared';

export function assignmentGroups(assignments: readonly MyAssignment[], today: string) {
  const ordered = [...assignments].sort((a, b) => a.shift.startsAt.localeCompare(b.shift.startsAt) || a.id.localeCompare(b.id));
  return {
    today: ordered.filter((assignment) => assignment.date === today),
    upcoming: ordered.filter((assignment) => assignment.date > today),
    past: ordered.filter((assignment) => assignment.date < today),
  };
}
