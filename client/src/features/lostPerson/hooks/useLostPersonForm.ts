import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useMe } from '@/features/session';
import { useRaiseLostPerson } from '@/features/lostPerson';
export function useLostPersonForm() {
  const fields = useLostPersonFields();
  const { description, approxAge, clothing, setDescriptionError } = fields;
  const router = useRouter();
  const mutation = useRaiseLostPerson();
  const { data: me } = useMe();

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (description.trim().length < 3) {
      setDescriptionError(
        'Please provide a description of who we are looking for (at least 3 characters).',
      );
      return;
    }

    setPending(true);
    setDescriptionError(null);
    setFormError(null);

    try {
      await mutation.mutateAsync({
        descriptionText: description.trim(),
        ...(approxAge.trim() ? { approxAge: approxAge.trim() } : {}),
        ...(clothing.trim() ? { clothingText: clothing.trim() } : {}),
        ...(me?.currentAssignment ? { lastSeenStationId: me.currentAssignment.station.id } : {}),
        lastSeenAt: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      });

      router.replace('/home');
    } catch {
      setFormError(
        'The alert could not be sent. Call your IC on the radio now — do not wait for this screen.',
      );
    } finally {
      setPending(false);
    }
  }

  return { ...fields, pending, formError, submit, me };
}
export type LostPersonFormState = ReturnType<typeof useLostPersonForm>;

function useLostPersonFields() {
  const [description, setDescription] = useState('');
  const [approxAge, setApproxAge] = useState('');
  const [clothing, setClothing] = useState('');
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  return {
    description,
    setDescription,
    approxAge,
    setApproxAge,
    clothing,
    setClothing,
    descriptionError,
    setDescriptionError,
  };
}
