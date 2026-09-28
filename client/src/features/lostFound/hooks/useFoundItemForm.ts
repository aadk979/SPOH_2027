import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useMe } from '@/features/session';
import { useCreateLostFound } from '@/features/lostFound';
import { usePhotoUpload } from '@/features/media';
export function useFoundItemForm() {
  const fields = useFoundItemFields();
  const { itemLabel, categoryLabel, holderNote, setItemError } = fields;
  const router = useRouter();
  const mutation = useCreateLostFound();
  const { data: me } = useMe();

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const photo = usePhotoUpload();

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (itemLabel.trim().length < 2) {
      setItemError('Please provide what the item is (at least 2 characters).');
      return;
    }

    setPending(true);
    setItemError(null);
    setFormError(null);

    try {
      await mutation.mutateAsync({
        itemLabel: itemLabel.trim(),
        ...(categoryLabel.trim() ? { categoryLabel: categoryLabel.trim() } : {}),
        ...(holderNote.trim() ? { holderNote: holderNote.trim() } : {}),
        ...(photo.key ? { photoKey: photo.key } : {}),
        ...(me?.currentAssignment ? { foundStationId: me.currentAssignment.station.id } : {}),
        foundAt: new Date().toISOString(),
      });

      router.replace('/safety/lost-found');
    } catch {
      setFormError('Could not save. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return { ...fields, pending, formError, photo, submit, me };
}
export type FoundItemFormState = ReturnType<typeof useFoundItemForm>;

function useFoundItemFields() {
  const [itemLabel, setItemLabel] = useState('');
  const [categoryLabel, setCategoryLabel] = useState('');
  const [holderNote, setHolderNote] = useState('');
  const [itemError, setItemError] = useState<string | null>(null);
  return {
    itemLabel,
    setItemLabel,
    categoryLabel,
    setCategoryLabel,
    holderNote,
    setHolderNote,
    itemError,
    setItemError,
  };
}
