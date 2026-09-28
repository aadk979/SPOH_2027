import { type ReactNode } from 'react';
import { type VolunteerAdminRecord } from '@spoh/shared';

export function StatusChip({ volunteer }: { volunteer: VolunteerAdminRecord }): ReactNode {
  const [label, className] = !volunteer.active
    ? ['Deactivated', 'bg-warn-surface text-warn']
    : !volunteer.hasSignedIn
      ? ['Never signed in', 'bg-alert-surface text-alert']
      : [
          `${volunteer.assignmentCount} ${volunteer.assignmentCount === 1 ? 'shift' : 'shifts'}`,
          'bg-surface-alt text-text-muted',
        ];

  return (
    <span
      className={`rounded-pill px-sm py-xxs text-caption font-semibold whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}
