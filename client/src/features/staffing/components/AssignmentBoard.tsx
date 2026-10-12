import { useState } from 'react';
import { useEventTime } from '@/features/session';
import { Card, CountHelp, EmptyState, Field, LoadingRows, Select, Stack, ErrorState } from '@/shared/ui';
import { useAssignmentBoard } from '../queries';
import { assignmentCells } from '../model/board';
import { AssignmentForm } from './AssignmentForm';
import { UnassignAssignment } from './UnassignAssignment';

export function AssignmentBoard({ enabled }: { enabled: boolean }) {
  const query = useAssignmentBoard(enabled);
  const format = useEventTime();
  const [dayId, setDayId] = useState('');
  const day = query.data?.days.find((item) => item.id === dayId) ?? query.data?.days[0];
  if (query.isPending) return <LoadingRows label="Loading assignment board" />;
  if (query.isError)
    return (
      <ErrorState error={query.error} operation="Loading assignment board" onRetry={() => void query.refetch()} />
    );
  if (!query.data || !day) return <EmptyState title="No assignment days">Create event days and shifts before assigning people.</EmptyState>;
  const cells = assignmentCells({
    day,
    stations: query.data.stations,
    assignments: query.data.assignments,
  });
  return (
    <Stack>
      <Field id="staffing-day" label="Day" hint="Show station coverage for this event day. Changing this selection does not change assignments.">
        {(props) => (
          <Select {...props} value={day.id} onChange={(event) => setDayId(event.target.value)}>
            {query.data.days.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.date}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <p role="status">
        {cells.filter((cell) => !cell.assignments.length).length} unstaffed station shifts of{' '}
        {cells.length}.
      </p>
      <CountHelp topic="staffing" />
      {cells.map((cell) => (
        <Card
          key={`${cell.station.id}:${cell.shift.id}`}
          tone={cell.assignments.length ? 'neutral' : 'warn'}
        >
          <h3 className="font-semibold">
            {cell.shift.label} · {format.shiftHours(cell.shift)} · {cell.station.name}
          </h3>
          <p>
            {cell.assignments.length} assigned{cell.assignments.length ? '' : ' · Coverage gap'}
          </p>
          <ul>
            {cell.assignments.map((assignment) => (
              <li key={assignment.id} className="flex flex-wrap items-center gap-sm">
                {assignment.volunteerName} · {assignment.roleLabel}
                <UnassignAssignment assignment={assignment} />
              </li>
            ))}
          </ul>
          <details className="mt-sm">
            <summary>Assign to {cell.station.name}</summary>
            <AssignmentForm
              stationId={cell.station.id}
              shiftId={cell.shift.id}
              people={query.data!.people}
            />
          </details>
        </Card>
      ))}
    </Stack>
  );
}
