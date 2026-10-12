import type { ReactNode } from 'react';
import type { StationDashboardResponse } from '@spoh/shared';
import { Card, Section, StatusText } from '@/shared/ui';
import { useEvent } from '@/shared/lib/eventContext';
import { shiftHours } from '@/shared/lib/format';
import { entityPath } from '@/shared/lib/workspacePath';
import { AppLink } from '@/shared/lib/AppLink';

/** One row per assignment, so a person on two shifts is listed once for each, with its hours. */
export function StationRoster({ board }: { board: StationDashboardResponse }): ReactNode {
  const { timezone } = useEvent();
  return (
    <Section title="Who is here">
      <Card as="ul" className="flex flex-col divide-y divide-line-soft">
        {board.roster.length === 0 ? (
          <li className="text-text-muted">Nobody rostered here today.</li>
        ) : (
          board.roster.map((person) => (
            <li
              key={person.assignmentId}
              className="flex items-center justify-between gap-sm py-xs first:pt-0 last:pb-0"
            >
              <span className="min-w-0">
                <AppLink className="block text-primary underline" href={entityPath({ kind: 'assignment', id: person.assignmentId })}>{person.volunteerName}</AppLink>
                <span className="block text-caption text-text-muted">
                  {person.roleLabel} · {shiftHours(person.shift, timezone)}
                </span>
              </span>

              <StatusText
                tone={person.checkedOutAt ? 'neutral' : person.checkedInAt ? 'ok' : 'warn'}
                className="shrink-0"
              >
                {person.checkedOutAt ? 'Left' : person.checkedInAt ? 'Checked in' : 'Not arrived'}
              </StatusText>
            </li>
          ))
        )}
      </Card>
    </Section>
  );
}
