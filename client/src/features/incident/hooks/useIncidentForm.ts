import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useMe } from '@/features/session';
import type { IncidentSeverity, IncidentType } from '@spoh/shared';
import { useCreateIncident } from '@/features/incident';
export function useIncidentForm() {
  const fields = useIncidentFields();
  const { type, severity, description, locationNote, setDescriptionError } = fields;
  const router = useRouter();
  const mutation = useCreateIncident();
  const { data: me } = useMe();

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (description.trim().length < 10) {
      setDescriptionError('Please provide at least 10 characters describing what happened.');
      return;
    }

    setPending(true);
    setDescriptionError(null);
    setFormError(null);

    try {
      await mutation.mutateAsync({
        type,
        severity,
        ...(me?.currentAssignment ? { stationId: me.currentAssignment.station.id } : {}),
        ...(locationNote.trim() ? { locationNote: locationNote.trim() } : {}),
        description: description.trim(),
        occurredAt: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      });

      router.replace('/home');
    } catch {
      setFormError('The report could not be sent. Tell your IC directly, then try again.');
    } finally {
      setPending(false);
    }
  }

  return { ...fields, pending, formError, submit, me };
}
export type IncidentFormState = ReturnType<typeof useIncidentForm>;

function useIncidentFields() {
  const [type, setType] = useState<IncidentType>('NEAR_MISS');
  const [severity, setSeverity] = useState<IncidentSeverity>('LOW');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  return {
    type,
    setType,
    severity,
    setSeverity,
    description,
    setDescription,
    locationNote,
    setLocationNote,
    descriptionError,
    setDescriptionError,
  };
}
