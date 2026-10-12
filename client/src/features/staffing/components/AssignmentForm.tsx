import { CreateAssignmentRequest, type VolunteerAdminRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Field, Input, Select, Stack } from '@/shared/ui';
import { assignVolunteer } from '../api';
import { useStaffingWrite } from '../queries';
import { MutationFeedback } from './MutationFeedback';

export function AssignmentForm({
  stationId,
  shiftId,
  people,
}: {
  stationId: string;
  shiftId: string;
  people: VolunteerAdminRecord[];
}) {
  const form = useZodForm(CreateAssignmentRequest, { volunteerId: '', roleLabel: 'Volunteer' });
  const mutation = useStaffingWrite(assignVolunteer);
  function submit() {
    const body = form.validate({ ...form.values, stationId, shiftId });
    if (body) mutation.mutate(body);
  }
  return (
    <form onSubmit={(event) => { event.preventDefault(); submit(); }}><Stack>
      <Field
        id={`person-${stationId}-${shiftId}`}
        label="Assign person"
        hint="Assign this person to the selected station and shift. An existing posting on this shift moves here."
        error={form.errors.volunteerId}
      >
        {(props) => (
          <Select
            {...props}
            value={form.values.volunteerId}
            disabled={mutation.isPending}
            onChange={(event) => form.setField('volunteerId', event.target.value)}
          >
            <option value="">Choose a person</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.displayName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        id={`role-${stationId}-${shiftId}`}
        label="Assignment role"
        hint="A label for this posting; it does not change the person's account permissions."
        error={form.errors.roleLabel}
      >
        {(props) => (
          <Input
            {...props}
            value={form.values.roleLabel}
            disabled={mutation.isPending}
            onChange={(event) => form.setField('roleLabel', event.target.value)}
          />
        )}
      </Field>
      <p className="text-caption">
        Assigning someone already on this shift moves their posting here.
      </p>
      <Button type="submit" disabled={mutation.isPending}>
        Assign
      </Button>
      <MutationFeedback error={mutation.error} saved={mutation.isSuccess} />
    </Stack></form>
  );
}
