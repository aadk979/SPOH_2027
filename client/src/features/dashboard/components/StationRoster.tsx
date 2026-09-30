import type { ReactNode } from 'react';
import type { StationDashboardResponse } from '@spoh/shared';
import { zonedWallTime } from '@spoh/shared';
import { Card, Section, StatusText } from '@/shared/ui';
import { useEvent } from '@/shared/lib/eventContext';

type Person = StationDashboardResponse['roster'][number];

/** "09:30–14:00": the shift's own hours on the event's clock (P09.12). */
function shiftHours(person: Person, timezone: string): string {
  if (!person.shift) return person.block;
  const at = (iso: string) => zonedWallTime(new Date(iso), timezone).slice(11, 16);
  return `${at(person.shift.startsAt)}–${at(person.shift.endsAt)}`;
}
/** One row per assignment, so a person on both blocks is listed once for each, with its hours. */
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
                <span className="block">{person.volunteerName}</span>
                <span className="block text-caption text-text-muted">
                  {person.roleLabel} · {shiftHours(person, timezone)}
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
