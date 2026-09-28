import type { ReactNode } from 'react';
import type { StationDashboardResponse } from '@spoh/shared';
import { Card, Section, StatusText } from '@/shared/ui';
export function StationRoster({ board }: { board: StationDashboardResponse }): ReactNode {
  return (
    <Section title="Who is here">
      <Card as="ul" className="flex flex-col divide-y divide-line-soft">
        {board.roster.length === 0 ? (
          <li className="text-text-muted">Nobody rostered here today.</li>
        ) : (
          board.roster.map((person) => (
            <li
              key={person.volunteerId}
              className="flex items-center justify-between gap-sm py-xs first:pt-0 last:pb-0"
            >
              <span className="min-w-0">
                <span className="block">{person.volunteerName}</span>
                <span className="block text-caption text-text-muted">{person.roleLabel}</span>
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
