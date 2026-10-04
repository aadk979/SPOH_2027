import { useEffect, useMemo } from 'react';
import { currentVolunteerId } from '@/shared/lib/session';
import type { EventStatus } from '@spoh/shared';

/** One File object is one in-memory intent; identical names/sizes are not identity. */
function photoIntent(eventId: string, personId: string | null, status: EventStatus) {
  let active = false;
  let generation = 0;
  let selected: { file: File; idempotencyKey: string } | null = null;
  const discard = () => {
    generation += 1;
    selected = null;
  };
  return {
    eventId,
    begin(file: File) {
      if (!active || !personId || currentVolunteerId() !== personId) return null;
      if (status !== 'LIVE' && status !== 'REHEARSAL') return null;
      if (selected?.file !== file) selected = { file, idempotencyKey: crypto.randomUUID() };
      const started = ++generation;
      return {
        idempotencyKey: selected.idempotencyKey,
        // Sign-out changes this store synchronously, before React's effect cleanup.
        current: () => active && generation === started && currentVolunteerId() === personId,
      };
    },
    discard,
    selectedFile: () => selected?.file ?? null,
    activate() {
      active = true;
    },
    dispose() {
      active = false;
      discard();
    },
  };
}

/** Token refresh keeps an intent; event/person changes and unmount invalidate it. */
export function usePhotoIntent(eventId: string, personId: string | null, status: EventStatus) {
  const owner = useMemo(() => photoIntent(eventId, personId, status), [eventId, personId, status]);
  useEffect(() => {
    owner.activate();
    return () => owner.dispose();
  }, [owner]);
  return owner;
}
