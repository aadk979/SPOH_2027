import { CreateLostFoundRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useMe } from '@/features/session';
import { useCreateLostFound } from '@/features/lostFound';
import { usePhotoUpload } from '@/features/media';
export function useFoundItemForm() {
  const fields = useFoundItemFields();
  const { itemLabel, categoryLabel, holderNote } = fields;
  const router = useRouter();
  const mutation = useCreateLostFound();
  const { data: me } = useMe();

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const photo = usePhotoUpload();

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setFormError(null);

    try {
      const request = fields.validate({
        itemLabel: itemLabel.trim(),
        ...(categoryLabel.trim() ? { categoryLabel: categoryLabel.trim() } : {}),
        ...(holderNote.trim() ? { holderNote: holderNote.trim() } : {}),
        ...(photo.key ? { photoKey: photo.key } : {}),
        ...(me?.currentAssignment ? { foundStationId: me.currentAssignment.station.id } : {}),
        foundAt: new Date().toISOString(),
      });
      if (!request) return;
      await mutation.mutateAsync(request);

      router.replace('/safety/lost-found');
    } catch {
      setFormError('Could not save. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return {
    ...fields,
    pending,
    formError:
      formError ??
      fields.errors.foundStationId ??
      fields.errors.foundAt ??
      fields.errors.photoKey ??
      fields.errors._form,
    photo,
    submit,
    me,
  };
}
export type FoundItemFormState = ReturnType<typeof useFoundItemForm>;

function useFoundItemFields() {
  const form = useZodForm(CreateLostFoundRequest, {
    itemLabel: '',
    categoryLabel: '',
    holderNote: '',
  });
  return {
    ...form.values,
    setItemLabel: (value: typeof form.values.itemLabel) => form.setField('itemLabel', value),
    setCategoryLabel: (value: typeof form.values.categoryLabel) =>
      form.setField('categoryLabel', value),
    setHolderNote: (value: typeof form.values.holderNote) => form.setField('holderNote', value),
    errors: form.errors,
    itemError: form.errors.itemLabel,
    validate: form.validate,
  };
}
