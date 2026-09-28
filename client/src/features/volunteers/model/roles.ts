import type { CommitteeRole } from '@spoh/shared';

/** Committee roles in precedence order, for a select that reads sensibly. */
export const ROLE_LABELS: ReadonlyArray<{ value: CommitteeRole; label: string }> = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'CHIEF_COORDINATOR', label: 'Chief Coordinator' },
  { value: 'DEPUTY_COORDINATOR', label: 'Deputy Coordinator' },
  { value: 'IC', label: 'IC' },
  { value: 'VOLUNTEER', label: 'Volunteer' },
];

export function roleLabel(role: CommitteeRole): string {
  return ROLE_LABELS.find((entry) => entry.value === role)?.label ?? role;
}
