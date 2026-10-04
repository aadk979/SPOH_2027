import { useCallback } from 'react';
import type { UploadContentType } from '@spoh/shared';
import { createUpload, uploadFile } from '../api';
import { EMPTY_PHOTO, type PhotoState } from '../model/photoState';
import type { usePhotoIntent } from './usePhotoIntent';

const ACCEPTED: Record<string, UploadContentType> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};
type Owner = ReturnType<typeof usePhotoIntent>;
type Ticket = { idempotencyKey: string; current(): boolean };

/** Files go straight to S3; stale credentials never start a new object upload. */
async function uploadPhoto(
  eventId: string,
  input: { file: File; contentType: UploadContentType; ticket: Ticket },
) {
  const { file, contentType, ticket } = input;
  const policy = await createUpload(eventId, {
    idempotencyKey: ticket.idempotencyKey,
    purpose: 'lostFound',
    contentType,
    contentLength: file.size,
  });
  if (!ticket.current()) return null;
  await uploadFile(policy, file);
  return ticket.current() ? policy.key : null;
}

export function usePhotoSubmission(owner: Owner, save: (photo: PhotoState) => void) {
  return useCallback(
    async (file: File) => {
      const contentType = ACCEPTED[file.type];
      if (!contentType) {
        owner.discard();
        save({
          ...EMPTY_PHOTO,
          state: 'error',
          error: 'That file is not a photo. Use the camera, or pick a JPEG or PNG.',
        });
        return;
      }
      const ticket = owner.begin(file);
      if (!ticket) return;
      save({ ...EMPTY_PHOTO, state: 'uploading' });
      try {
        const key = await uploadPhoto(owner.eventId, { file, contentType, ticket });
        if (key)
          save({ ...EMPTY_PHOTO, state: 'done', key, previewUrl: URL.createObjectURL(file) });
      } catch {
        if (ticket.current())
          save({
            ...EMPTY_PHOTO,
            state: 'error',
            error: 'The photo did not upload. You can still save the item without it.',
          });
      }
    },
    [owner, save],
  );
}
