import { CreateIncidentRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useAppRouter } from '@/shared/lib/appPath';
import { useState, type FormEvent } from 'react';
import { useMe } from '@/features/session';
import type { IncidentSeverity, IncidentType } from '@spoh/shared';
import { useCreateIncident } from '../queries';
import { incidentEndpoints } from '../api';
import { sendOrQueue } from '@/shared/lib/sendOrQueue';
import { useEventId } from '@/shared/lib/eventContext';
import { toIncidentRequest } from '../model/incidentRequest';
export function useIncidentForm() {
  const fields = useIncidentFields();
  const router = useAppRouter();
  const mutation = useCreateIncident();
  const { data: me } = useMe();
  const eventId = useEventId();

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setQueued(false);

    try {
      const request = fields.validate(toIncidentRequest(fields, me?.currentAssignment?.station.id));
      if (!request) return;
      const outcome = await sendOrQueue({
        eventId,
        path: incidentEndpoints.create,
        body: request,
        send: () => mutation.mutateAsync(request),
      });
      if (outcome.status === 'queued') {
        // The report waits on this phone; the people involved cannot (ADR-007 §5).
        setQueued(true);
        fields.reset();
        return;
      }

      router.replace('/home');
    } catch {
      setFormError('The report could not be sent. Tell your IC directly, then try again.');
    } finally {
      setPending(false);
    }
  }

  return {
    ...fields,
    pending,
    queued,
    formError:
      formError ??
      fields.errors.stationId ??
      fields.errors.occurredAt ??
      fields.errors.idempotencyKey ??
      fields.errors._form,
    submit,
    me,
  };
}
export type IncidentFormState = ReturnType<typeof useIncidentForm>;

function useIncidentFields() {
  const form = useZodForm(CreateIncidentRequest, {
    type: 'NEAR_MISS' as IncidentType,
    severity: 'LOW' as IncidentSeverity,
    description: '',
    locationNote: '',
  });
  return {
    ...form.values,
    setType: (value: typeof form.values.type) => form.setField('type', value),
    setSeverity: (value: typeof form.values.severity) => form.setField('severity', value),
    setDescription: (value: typeof form.values.description) => form.setField('description', value),
    setLocationNote: (value: typeof form.values.locationNote) =>
      form.setField('locationNote', value),
    errors: form.errors,
    descriptionError: form.errors.description,
    validate: form.validate,
    reset: () => form.reset(),
  };
}
