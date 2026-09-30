import { RaiseLostPersonRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useAppRouter } from '@/shared/lib/appPath';
import { useState, type FormEvent } from 'react';
import { useMe } from '@/features/session';
import { useRaiseLostPerson } from '@/features/lostPerson';
export function useLostPersonForm() {
  const fields = useLostPersonFields();
  const { description, approxAge, clothing } = fields;
  const router = useAppRouter();
  const mutation = useRaiseLostPerson();
  const { data: me } = useMe();

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setFormError(null);

    try {
      const request = fields.validate({
        descriptionText: description.trim(),
        ...(approxAge.trim() ? { approxAge: approxAge.trim() } : {}),
        ...(clothing.trim() ? { clothingText: clothing.trim() } : {}),
        ...(me?.currentAssignment ? { lastSeenStationId: me.currentAssignment.station.id } : {}),
        lastSeenAt: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      });
      if (!request) return;
      await mutation.mutateAsync(request);

      router.replace('/home');
    } catch {
      // Never queued (ADR-007 §5): a late alert teaches people to ignore alerts.
      // The description stays for an explicit "send now".
      setFormError(
        'The alert could not be sent. Call your IC on the radio now — do not wait for this screen.',
      );
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return {
    ...fields,
    pending,
    failed,
    formError:
      formError ??
      fields.errors.lastSeenStationId ??
      fields.errors.lastSeenAt ??
      fields.errors.idempotencyKey ??
      fields.errors._form,
    submit,
    me,
  };
}
export type LostPersonFormState = ReturnType<typeof useLostPersonForm>;

function useLostPersonFields() {
  const form = useZodForm(RaiseLostPersonRequest, {
    descriptionText: '',
    approxAge: '',
    clothingText: '',
  });
  return {
    ...form.values,
    description: form.values.descriptionText,
    clothing: form.values.clothingText,
    setDescription: (value: typeof form.values.descriptionText) =>
      form.setField('descriptionText', value),
    setApproxAge: (value: typeof form.values.approxAge) => form.setField('approxAge', value),
    setClothing: (value: typeof form.values.clothingText) => form.setField('clothingText', value),
    errors: form.errors,
    descriptionError: form.errors.descriptionText,
    validate: form.validate,
  };
}
