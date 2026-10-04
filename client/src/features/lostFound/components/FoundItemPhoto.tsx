import type { ReactNode } from 'react';
import type { FoundItemFormState } from '../hooks/useFoundItemForm';
import { Button, Field } from '@/shared/ui';
export function FoundItemPhoto({ form }: { form: FoundItemFormState }): ReactNode {
  const { photo } = form;
  return (
    <>
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

              {photo.canRetry ? (
                <Button variant="quiet" size="sm" type="button" onClick={() => void photo.retry()}>
                  Retry photo
                </Button>
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
    </>
  );
}
