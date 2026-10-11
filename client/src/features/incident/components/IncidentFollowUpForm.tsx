import { CreateIncidentFollowUpRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Callout, Field, Textarea } from '@/shared/ui';
import { useIncidentFollowUp } from '../queries';

export function IncidentFollowUpForm({ id }: { id: string }) {
  const form = useZodForm(CreateIncidentFollowUpRequest, { note: '' });
  const mutation = useIncidentFollowUp(id);
  function submit() {
    const request = form.validate();
    if (request) mutation.mutate(request, { onSuccess: () => form.reset() });
  }
  return (
    <>
      <Field
        id={`follow-up-${id}`}
        label="Follow-up note"
        hint="Describe the event, not the people. Notes are append-only."
        error={form.errors.note}
      >
        {(props) => (
          <Textarea
            {...props}
            value={form.values.note}
            maxLength={2000}
            onChange={(event) => form.setField('note', event.target.value)}
          />
        )}
      </Field>
      <Button variant="secondary" disabled={mutation.isPending} onClick={submit}>
        Append follow-up
      </Button>
      {mutation.error ? (
        <Callout tone="alert" role="alert">
          {mutation.error.message}
        </Callout>
      ) : null}
      {mutation.isSuccess ? <p role="status">Follow-up recorded.</p> : null}
    </>
  );
}
