import { useState, type ReactNode } from 'react';
import type { EventContent } from '@spoh/shared';
import type { FormErrors } from '@/shared/hooks/useZodForm';
import { Button, Callout, Field, Input, Stack } from '@/shared/ui';
import { ContentTextField } from './ContentTextField';
import { useUploadContentImage } from '../queries';
type Floor = EventContent['map']['levels'][number];
export function FloorPlanUpload({
  floor,
  index,
  errors,
  onChange,
  onPendingChange,
}: {
  floor: Floor;
  index: number;
  errors: FormErrors;
  onChange(value: Floor): void;
  onPendingChange(pending: boolean): void;
}): ReactNode {
  const upload = useUploadContentImage();
  const [failure, setFailure] = useState<string | null>(null);
  function choose(file?: File): void {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      setFailure('Choose a PNG, JPEG or WebP image no larger than 1 MB.');
      return;
    }
    setFailure(null);
    onPendingChange(true);
    upload.mutate(file, {
      onSuccess: (mediaKey) =>
        onChange({ ...floor, image: { mediaKey, alt: floor.image?.alt ?? '' } }),
      onSettled: () => onPendingChange(false),
    });
  }
  return (
    <Stack>
      <Field
        id={`floor-upload-${index}`}
        label={`${floor.label || `Level ${index + 1}`}: floor plan`}
        optional
        hint="Upload a PNG, JPEG or WebP image, up to 1 MB. It becomes available to volunteers when published."
      >
        {(props) => (
          <Input
            {...props}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={upload.isPending}
            onChange={(event) => choose(event.target.files?.[0])}
          />
        )}
      </Field>
      {floor.image ? (
        <>
          <p role="status">Floor plan uploaded.</p>
          <ContentTextField
            path={`map.levels.${index}.image.alt`}
            label="Floor plan description"
            max={200}
            value={floor.image.alt}
            error={errors[`map.levels.${index}.image.alt`]}
            hint="Describe what the image shows for people using a screen reader. Keep locations in the text list too."
            onChange={(alt) => onChange({ ...floor, image: { ...floor.image!, alt } })}
          />
          <Button
            type="button"
            variant="quiet"
            onClick={() => onChange({ ...floor, image: undefined })}
          >
            Remove floor plan
          </Button>
        </>
      ) : null}
      {failure || upload.error ? (
        <Callout tone="alert" role="alert">
          {failure ?? upload.error?.message}
        </Callout>
      ) : null}
      {upload.isPending ? <p role="status">Uploading floor plan…</p> : null}
    </Stack>
  );
}
