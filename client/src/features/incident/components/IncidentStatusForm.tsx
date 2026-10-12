import { IncidentStatus, UpdateIncidentStatusRequest, type IncidentRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Field, Select, Textarea, ErrorState } from '@/shared/ui';
import { useIncidentStatus } from '../queries';

export function IncidentStatusForm({ incident }: { incident: IncidentRecord }) {
  const form = useZodForm(UpdateIncidentStatusRequest, { status: incident.status, note: '' });
  const mutation = useIncidentStatus(incident.id);
  function submit() {
    const request = form.validate();
    if (request) mutation.mutate(request);
  }
  return (
    <>
      <Field id={`status-${incident.id}`} label="Incident status" error={form.errors.status}>
        {(props) => (
          <Select
            {...props}
            value={form.values.status}
            onChange={(event) => form.setField('status', event.target.value as IncidentStatus)}
          >
            {IncidentStatus.options.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        id={`status-note-${incident.id}`}
        label="Status note"
        optional
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
      <Button
        disabled={mutation.isPending || form.values.status === incident.status}
        onClick={submit}
      >
        Update incident status
      </Button>
      {mutation.error ? (
        <ErrorState error={mutation.error} />
      ) : null}
      {mutation.isSuccess ? <p role="status">Incident status updated.</p> : null}
    </>
  );
}
