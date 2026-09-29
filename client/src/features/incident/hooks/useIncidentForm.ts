import { CreateIncidentRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useMe } from '@/features/session';
import type { IncidentSeverity, IncidentType } from '@spoh/shared';
import { useCreateIncident } from '@/features/incident';
export function useIncidentForm() {
  const fields = useIncidentFields();
  const { type, severity, description, locationNote } = fields;
  const router = useRouter();
  const mutation = useCreateIncident();
  const { data: me } = useMe();

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setFormError(null);

    try {
      const request = fields.validate({
        type,
        severity,
        ...(me?.currentAssignment ? { stationId: me.currentAssignment.station.id } : {}),
        ...(locationNote.trim() ? { locationNote: locationNote.trim() } : {}),
        description: description.trim(),
        occurredAt: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      });
      if (!request) return;
      await mutation.mutateAsync(request);

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
  };
}
