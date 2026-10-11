import { useState } from 'react';
import { useEventTime } from '@/features/session';
import { Button, Callout, Card, Field, Select, Stack } from '@/shared/ui';
import { unassignVolunteer } from '../api';
import { useAssignmentBoard, useStaffingWrite } from '../queries';
import { assignmentCells } from '../model/board';
import { AssignmentForm } from './AssignmentForm';
import { MutationFeedback } from './MutationFeedback';

export function AssignmentBoard({ enabled }: { enabled: boolean }) {
  const query = useAssignmentBoard(enabled);
  const format = useEventTime();
  const [dayId, setDayId] = useState('');
  const remove = useStaffingWrite(unassignVolunteer);
  const day = query.data?.days.find((item) => item.id === dayId) ?? query.data?.days[0];
  if (query.isPending) return <p>Loading assignment board…</p>;
  if (query.isError)
    return (
      <Callout tone="alert" role="alert">
        {query.error.message}
      </Callout>
    );
  if (!query.data || !day) return <p>Create event days and shifts before assigning people.</p>;
  const cells = assignmentCells({
    day,
    stations: query.data.stations,
    assignments: query.data.assignments,
  });
  return (
    <Stack>
      <Field id="staffing-day" label="Day">
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
      <MutationFeedback error={remove.error} saved={remove.isSuccess} />
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
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(assignment.id)}
                >
                  Unassign {assignment.volunteerName}
                </Button>
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
