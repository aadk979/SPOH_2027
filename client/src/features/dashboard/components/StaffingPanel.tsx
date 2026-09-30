import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { Card, CardGrid, Section } from '@/shared/ui';
import { StatTile } from '@/features/dashboard';
import { formatDuration } from '@/shared/lib/format';
export function StaffingPanel({ data }: { data: LiveDashboardResponse }): ReactNode {
  return (
    <Section title="Staffing">
      <CardGrid columns={2}>
        <StatTile
          label="On shift"
          value={data.staffing.onShift}
          unit="assignments this block"
          note={`${data.staffing.checkedIn} checked in`}
        />
        <StatTile
          label="Staffing gaps"
          value={data.staffing.gaps.length}
          unit="stations needing attention"
          tone={data.staffing.gaps.length > 0 ? 'warn' : 'ok'}
        />
      </CardGrid>

      {data.staffing.gaps.length > 0 ? (
        // Columns, because this is a flat list of short lines: sixteen of
        // them down a single 1400px column was one phrase per row and a
        // screenful of scrolling to read what fits in a third of the height.
        <Card as="ul" className="mt-sm grid gap-x-lg gap-y-xxs sm:grid-cols-2 xl:grid-cols-3">
          {data.staffing.gaps.map((gap) => (
            <li key={`${gap.stationId}:${gap.shift.code}`}>
              <strong>{gap.stationName}</strong>{' '}
              <span className="text-text-muted">
                {gap.severity === 'UNSTAFFED'
                  ? 'nobody rostered'
                  : gap.severity === 'NOBODY_CHECKED_IN'
                    ? `${gap.assigned} rostered, none checked in`
                    : `${gap.missing} of ${gap.assigned} missing`}
              </span>
            </li>
          ))}
        </Card>
      ) : null}

      {data.staffing.longShifts.length > 0 ? (
        <Card tone="warn" className="mt-sm">
          <h3 className="text-body font-semibold text-warn">
            On station three hours or more, no break recorded
          </h3>
          <ul className="mt-xs flex flex-col gap-xxs text-text-muted">
            {data.staffing.longShifts.map((warning) => (
              <li key={warning.volunteerId}>
                {warning.volunteerName} — {warning.stationName},{' '}
                {formatDuration(warning.minutesOnStation)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </Section>
  );
}
