import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { Card, CardGrid, Section, PermissionDenied, ControlHelp } from '@/shared/ui';
import { StatTile } from '@/features/dashboard';
import { formatDuration } from '@/shared/lib/format';
import { staffingLink } from '../model/drillLinks';
import { entityPath } from '@/shared/lib/workspacePath';
import { AppLink } from '@/shared/lib/AppLink';
export function StaffingPanel({ data }: { data: LiveDashboardResponse }): ReactNode {
  if (!['available', 'partial'].includes(data.staffing.rosterAvailability ?? 'denied')) return <PermissionDenied>Staffing details are unavailable under your current permission.</PermissionDenied>;
  return (
    <Section title="Staffing">
      <ControlHelp topic="staffing">{data.staffing.rosterAvailability === 'partial' ? 'Only stations whose roster you may read are included. ' : ''}On shift and checked in describe different assignment sets.</ControlHelp>
      <CardGrid columns={2}>
        <StatTile
          label="On shift"
          href={staffingLink(data.observation, 'running')}
          noteHref={staffingLink(data.observation, 'checkedIn')}
          value={data.staffing.onShift}
          unit="assignments this block"
          note={`${data.staffing.checkedIn} checked in`}
        />
        <StatTile
          label="Station / shift gaps"
          href={staffingLink(data.observation, 'gaps')}
          value={data.staffing.gaps.length}
          unit="station / shift cells needing attention"
          tone={data.staffing.gaps.length > 0 ? 'warn' : 'ok'}
        />
      </CardGrid>

      {data.staffing.gaps.length > 0 ? (
        // Columns, because this is a flat list of short lines: sixteen of
        // them down a single 1400px column was one phrase per row and a
        // screenful of scrolling to read what fits in a third of the height.
        <Card as="ul" className="mt-sm grid gap-x-lg gap-y-xxs sm:grid-cols-2 xl:grid-cols-3">
          {data.staffing.gaps.map((gap) => (
            <li key={`${gap.stationId}:${gap.shift.id}`}>
              <AppLink href={staffingLink(data.observation, 'gaps', { stationId: gap.stationId, shiftId: gap.shift.id }) ?? entityPath({ kind: 'station', id: gap.stationId })} className="text-primary underline"><strong>{gap.stationName} · {gap.shift.label}</strong></AppLink>{' '}
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
            Long checked-in shifts, no break recorded
          </h3>
          <ul className="mt-xs flex flex-col gap-xxs text-text-muted">
            {data.staffing.longShifts.map((warning) => (
              <li key={warning.volunteerId}>
                {warning.assignmentId ? <AppLink href={entityPath({ kind: 'assignment', id: warning.assignmentId })} className="text-primary underline">{warning.volunteerName} — {warning.stationName}</AppLink> : <>{warning.volunteerName} — {warning.stationName}</>},{' '}
                {formatDuration(warning.minutesOnStation)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </Section>
  );
}
