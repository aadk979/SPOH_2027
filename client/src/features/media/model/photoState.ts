export type UploadState = 'idle' | 'uploading' | 'done' | 'error';
export interface PhotoState {
  state: UploadState;
  key: string | null;
  previewUrl: string | null;
  error: string | null;
}
export const EMPTY_PHOTO: PhotoState = { state: 'idle', key: null, previewUrl: null, error: null };
