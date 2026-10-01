import type { FallbackWindowRecord, ImportResponse, MyEvent } from '@spoh/shared';

/** A historical sheet follows its window; a commit follows the reviewed preview. */
export function resolveImportMode(input: {
  windowId: string;
  windows: FallbackWindowRecord[];
  status: MyEvent['status'];
  preview: ImportResponse | null;
  commit: boolean;
}): boolean {
  const window = input.windows.find((item) => item.id === input.windowId);
  if (input.windowId && !window)
    throw new Error('The source fallback window is unavailable. Select it again.');
  if (input.commit) {
    if (!input.preview) throw new Error('Preview the import before committing it.');
    return input.preview.rehearsal;
  }
  return window?.rehearsal ?? input.status === 'REHEARSAL';
}
