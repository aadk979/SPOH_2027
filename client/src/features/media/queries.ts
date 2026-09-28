'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UploadContentType } from '@spoh/shared';
import { createUpload, uploadFile } from './api';
import { useMediaAvailability } from './hooks/useMediaAvailability';

/**
 * Photo upload.
 *
 * The file never passes through the API: the client asks for a presigned S3
 * policy, posts the file straight to the bucket, and hands back only the key.
 * A phone photo is two orders of magnitude larger than the 100 KB the API's
 * body parser accepts, and the instances doing this work are the ones answering
 * booth taps.
 *
 * The whole feature is optional. A deployment without a bucket reports
 * `available: false` and the caller hides the button — which is better than
 * offering a camera that 503s at the lost-and-found desk.
 *
 * docs/adr/ADR-003-configuration-model.md §8 still governs what may be photographed: an object, never a
 * person.
 */

const ACCEPTED: Record<string, UploadContentType> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

export type UploadState = 'idle' | 'uploading' | 'done' | 'error';

export interface UsePhotoUploadResult {
  /** False when the deployment has no media bucket configured. */
  available: boolean;
  state: UploadState;
  /** S3 key to store on the record, once an upload has succeeded. */
  key: string | null;
  /** Local object URL for a preview. Revoked when replaced. */
  previewUrl: string | null;
  error: string | null;
  upload(file: File): Promise<void>;
  reset(): void;
}

export function usePhotoUpload(): UsePhotoUploadResult {
  const available = useMediaAvailability();
  const [state, setState] = useState<UploadState>('idle');
  const [key, setKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // An object URL that outlives its preview is a leak that grows with every
  // photo taken at a busy desk.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const reset = useCallback(() => {
    setState('idle');
    setKey(null);
    setError(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  const upload = useCallback(async (file: File): Promise<void> => {
    const contentType = ACCEPTED[file.type];

    if (!contentType) {
      setError('That file is not a photo. Use the camera, or pick a JPEG or PNG.');
      setState('error');
      return;
    }

    setState('uploading');
    setError(null);

    try {
      const policy = await createUpload({
        purpose: 'lostFound',
        contentType,
        contentLength: file.size,
      });
      await uploadFile(policy, file);

      setKey(policy.key);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
      setState('done');
    } catch {
      // Never fatal: the item record is what matters and the photo is a
      // convenience. The caller keeps the form submittable.
      setError('The photo did not upload. You can still save the item without it.');
      setState('error');
    }
  }, []);

  return { available, state, key, previewUrl, error, upload, reset };
}
