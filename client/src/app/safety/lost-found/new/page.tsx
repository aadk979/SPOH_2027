'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, Callout, Field, Input } from '@/components/ui';
import { usePhotoUpload } from '@/features/media/usePhotoUpload';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';

/**
 * Log a found item (PRODUCT_BRIEF §7.2).
 *
 * Three fields that matter: what it is, where it was found, and where it is
 * being kept. The third is the one people forget and the one that makes the
 * item findable again.
 *
 * There is deliberately no field for who lost it. This is a record of an
 * object, not of a person — and the same rule governs the photo: it exists so
 * somebody can recognise a bottle among nine other bottles, and it must never
 * be a picture of the person who lost it or the person collecting it.
 */
export default function NewLostFoundPage(): ReactNode {
  const session = useRequireSession();
  const router = useRouter();
  const { data: me } = useMe();

  const [itemLabel, setItemLabel] = useState('');
  const [categoryLabel, setCategoryLabel] = useState('');
  const [holderNote, setHolderNote] = useState('');
  const [pending, setPending] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
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
      await api('/lost-found', {
        method: 'POST',
        body: {
          itemLabel: itemLabel.trim(),
          ...(categoryLabel.trim() ? { categoryLabel: categoryLabel.trim() } : {}),
          ...(holderNote.trim() ? { holderNote: holderNote.trim() } : {}),
          ...(photo.key ? { photoKey: photo.key } : {}),
          ...(me?.currentAssignment ? { foundStationId: me.currentAssignment.station.id } : {}),
          foundAt: new Date().toISOString(),
        },
      });

      router.replace('/safety/lost-found');
    } catch {
      setFormError('Could not save. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  if (!session) return null;

  return (
    <AppShell
      title="Log a found item"
      back={{ href: '/safety/lost-found', label: 'Lost and found' }}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-md">
        <Field
          id="item"
          label="What is it?"
          hint="Describe it the way somebody would ask for it."
          error={itemError}
        >
          {(props) => (
            <Input
              {...props}
              required
              minLength={2}
              maxLength={120}
              value={itemLabel}
              onChange={(event) => {
                setItemLabel(event.target.value);
                if (itemError) setItemError(null);
              }}
              placeholder="Blue metal water bottle with stickers"
              scale="lg"
            />
          )}
        </Field>

        <Field id="category" label="Kind of thing" optional>
          {(props) => (
            <Input
              {...props}
              maxLength={60}
              value={categoryLabel}
              onChange={(event) => setCategoryLabel(event.target.value)}
              placeholder="Bottle, bag, phone, clothing…"
            />
          )}
        </Field>

        <Field
          id="holder"
          label="Where is it being kept?"
          optional
          hint="The field people forget, and the one that makes it findable again."
        >
          {(props) => (
            <Input
              {...props}
              maxLength={200}
              value={holderNote}
              onChange={(event) => setHolderNote(event.target.value)}
              placeholder="Held at the Mission Complete desk"
            />
          )}
        </Field>

        {photo.available ? (
          <Field
            id="photo"
            label="Photo"
            optional
            hint="Of the item, never of a person. It makes one blue bottle findable among nine."
            error={photo.error}
          >
            {(props) => (
              <div className="flex flex-col gap-sm">
                <input
                  {...props}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  // Opens the rear camera on a phone rather than the gallery,
                  // which is what somebody standing over a found item wants.
                  capture="environment"
                  disabled={photo.state === 'uploading'}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void photo.upload(file);
                  }}
                  className="text-body file:mr-sm file:rounded-pill file:border-0 file:bg-surface-sunken file:px-md file:py-xs file:text-caption"
                />

                {photo.state === 'uploading' ? (
                  <p className="text-caption text-text-muted">Uploading…</p>
                ) : null}

                {photo.state === 'done' && photo.previewUrl ? (
                  <div className="flex items-center gap-sm">
                    {/*
                      A plain <img>, not next/image: the source is a local
                      object URL for a file that has not left the device yet,
                      which the image optimiser can do nothing with.
                    */}
                    <img
                      src={photo.previewUrl}
                      alt="The item you just photographed"
                      className="size-[64px] rounded-md object-cover"
                    />
                    <Button variant="quiet" size="sm" type="button" onClick={photo.reset}>
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </Field>
        ) : null}

        {me?.currentAssignment ? (
          <p className="text-caption text-text-muted">
            Recorded as found at {me.currentAssignment.station.name}.
          </p>
        ) : null}

        {formError ? (
          <Callout tone="alert" role="alert">
            {formError}
          </Callout>
        ) : null}

        <div>
          <Button type="submit" size="lg" block disabled={pending || itemLabel.trim().length < 2}>
            {pending ? 'Saving…' : 'Log this item'}
          </Button>

          <p className="mt-sm text-caption text-text-muted">
            Do not record anything about the person who lost it.
          </p>
        </div>
      </form>
    </AppShell>
  );
}
