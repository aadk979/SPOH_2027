import type { UploadState } from '@/features/media';

const MESSAGES: Record<UploadState, string> = {
  idle: 'No photo attached.',
  uploading: 'Uploading photo…',
  done: 'Photo uploaded and ready to attach.',
  error: 'Photo upload was not confirmed. Choose another photo or save without it.',
};

/** Retain the region as upload state changes, including removal of a ready photo. */
export function PhotoUploadStatus({ state }: { state: UploadState }) {
  return <p role="status" aria-live="polite" className="text-caption text-text-muted">{MESSAGES[state]}</p>;
}
