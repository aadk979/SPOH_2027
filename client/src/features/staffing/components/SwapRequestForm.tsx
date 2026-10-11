import type { MyAssignment, SwapTargetRecord } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Button, Field, Select, Stack, Textarea } from '@/shared/ui';
import { useSwapRequestForm } from '../hooks/useSwapRequestForm';
import { MutationFeedback } from './MutationFeedback';

export function SwapRequestForm({
  assignments,
  targets,
}: {
  assignments: MyAssignment[];
  targets: SwapTargetRecord[];
}) {
  const { form, mutation, submit } = useSwapRequestForm();
  const format = useEventTime();
  return (
    <Stack>
      <Field id="swap-assignment" label="Shift to give away" error={form.errors.assignmentId}>
        {(props) => (
          <Select
            {...props}
            value={form.values.assignmentId}
            onChange={(event) => form.setField('assignmentId', event.target.value)}
          >
            <option value="">Choose your shift</option>
            {assignments.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {assignment.dayLabel} · {assignment.shift.label} ·{' '}
                {format.shiftHours(assignment.shift)} · {assignment.station.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="swap-target" label="Person taking the shift" error={form.errors.targetVolunteerId}>
        {(props) => (
          <Select
            {...props}
            value={form.values.targetVolunteerId}
            onChange={(event) => form.setField('targetVolunteerId', event.target.value)}
          >
            <option value="">Choose a person</option>
            {targets.map((person) => (
              <option key={person.id} value={person.id}>
                {person.displayName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="swap-reason" label="Swap reason" optional error={form.errors.reason}>
        {(props) => (
          <Textarea
            {...props}
            value={form.values.reason}
            onChange={(event) => form.setField('reason', event.target.value)}
          />
        )}
      </Field>
      <p>The IC reviews the request before your assignment changes.</p>
      <Button disabled={mutation.isPending} onClick={submit}>
        Request swap
      </Button>
      <MutationFeedback error={mutation.error} saved={mutation.isSuccess} />
    </Stack>
  );
}
