'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { useAllows, useCurrentSession } from '@/features/session';
import { getPhotoUrl } from './api';
export function usePhotoRead(key: string) {
  const eventId = useEventId();
  const session = useCurrentSession();
  const signedIn = session !== null;
  const allowed = useAllows()('Self.Read');
  const scope = `${eventId}:${session?.volunteerId}:${session?.role}:${key}`;
  const current = useRef<{ scope: string } | null>(null);
  useEffect(() => {
    current.current = signedIn && allowed ? { scope } : null;
    return () => {
      current.current = null;
    };
  }, [scope, allowed, signedIn]);
  return useMutation({
    mutationKey: [eventId, 'photo-read', session?.volunteerId, session?.role, key],
    mutationFn: async () => {
      const intent = current.current;
      if (intent?.scope !== scope) throw new Error('Photo access is unavailable.');
      const photo = await getPhotoUrl(eventId, key);
      if (current.current !== intent) throw new Error('This photo view is no longer open.');
      return photo;
    },
    gcTime: 0,
  });
}
import { useEvent } from '@/shared/lib/eventContext';
import { currentVolunteerId } from '@/shared/lib/session';
import { useMediaAvailability } from './hooks/useMediaAvailability';
import { usePhotoIntent } from './hooks/usePhotoIntent';
import { usePhotoSubmission } from './hooks/usePhotoSubmission';
import { EMPTY_PHOTO, type PhotoState } from './model/photoState';
export type { UploadState } from './model/photoState';

export interface UsePhotoUploadResult extends PhotoState {
  available: boolean;
  canRetry: boolean;
  upload(file: File): Promise<void>;
  retry(): Promise<void>;
  reset(): void;
}

/** Photo retries retain one UUID until the file, event, person or form changes. */
export function usePhotoUpload(): UsePhotoUploadResult {
  const configured = useMediaAvailability();
  const session = useCurrentSession();
  const event = useEvent();
  // Expiry drops a token temporarily; only explicit identity changes discard the File.
  const personId = session?.volunteerId ?? currentVolunteerId();
  const owner = usePhotoIntent(event.id, personId, event.status);
  const [saved, setSaved] = useState<{ owner: typeof owner; photo: PhotoState } | null>(null);
  const photo = saved?.owner === owner ? saved.photo : EMPTY_PHOTO;
  const save = useCallback((photo: PhotoState) => setSaved({ owner, photo }), [owner]);
  useEffect(() => {
    return () => {
      if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo.previewUrl]);
  const reset = useCallback(() => {
    owner.discard();
    save(EMPTY_PHOTO);
  }, [owner, save]);
  const upload = usePhotoSubmission(owner, save);
  const retry = useCallback(async () => {
    const file = owner.selectedFile();
    if (file) await upload(file);
  }, [owner, upload]);
  return {
    ...photo,
    available:
      configured && session !== null && (event.status === 'LIVE' || event.status === 'REHEARSAL'),
    upload,
    reset,
    retry,
    canRetry: photo.state === 'error' && owner.selectedFile() !== null,
  };
}
