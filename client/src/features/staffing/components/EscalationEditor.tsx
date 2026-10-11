import { UpdateVolunteerRequest, type VolunteerAdminRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, Card, Field, Select } from '@/shared/ui';
import { updateEscalation } from '../api';
import { useStaffingWrite } from '../queries';
import { MutationFeedback } from './MutationFeedback';

export function EscalationEditor({
  person,
  people,
}: {
  person: VolunteerAdminRecord;
  people: VolunteerAdminRecord[];
}) {
  const form = useZodForm(UpdateVolunteerRequest, { reportsToId: person.reportsToId ?? '' });
  const receipt = useRetryKey();
  const mutation = useStaffingWrite(updateEscalation);
  function save() {
    const patch = { reportsToId: form.values.reportsToId || null };
    const body = form.validate({ ...patch, idempotencyKey: receipt.forInput(patch) });
    if (body) mutation.mutate({ id: person.id, body }, { onSuccess: receipt.clear });
  }
  return (
    <Card>
      <Field
        id={`reports-${person.id}`}
        label={`${person.displayName} reports to`}
        error={form.errors.reportsToId}
      >
        {(props) => (
          <Select
            {...props}
            value={form.values.reportsToId}
            onChange={(event) => form.setField('reportsToId', event.target.value)}
          >
            <option value="">No reporting line</option>
            {people
              .filter((item) => item.id !== person.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
          </Select>
        )}
      </Field>
      <Button disabled={mutation.isPending} onClick={save}>
        Save reporting line
      </Button>
      <MutationFeedback error={mutation.error} saved={mutation.isSuccess} />
    </Card>
  );
}
